#include "Level/KKFloorGenerator.h"
#include "Level/KKFloorData.h"
#include "Level/KKRoomData.h"
#include "Core/KKContentRegistry.h"
#include "Core/KKSaveGame.h"
#include "Core/KKGameSettings.h"
#include "Kellerkind.h"

#include "Containers/Queue.h"
#include "Engine/LevelStreamingDynamic.h"
#include "Engine/World.h"

FVector UKKFloorGenerator::CoordToWorld(const FKKGridCoord& Coord)
{
	const float Size = UKKGameSettings::Get().RoomWorldSize;
	return FVector(Coord.X * Size, Coord.Y * Size, 0.f);
}

bool UKKFloorGenerator::IsInsideGrid(const FKKGridCoord& Coord, int32 GridSize) const
{
	const int32 Half = GridSize / 2;
	return FMath::Abs(Coord.X) <= Half && FMath::Abs(Coord.Y) <= Half;
}

int32 UKKFloorGenerator::CountNeighbours(const FKKFloorLayout& Layout, const FKKGridCoord& Coord) const
{
	int32 Count = 0;
	for (EKKDir Dir : KKDir::All)
	{
		if (Layout.Nodes.Contains(Coord.Offset(Dir)))
		{
			++Count;
		}
	}
	return Count;
}

FKKFloorLayout UKKFloorGenerator::GenerateLayout(const UKKFloorData* FloorData, int32 Seed, int32 NewGamePlusLevel,
	UKKContentRegistry* Registry, const UKKSaveGame* Save)
{
	FKKFloorLayout Layout;
	if (!FloorData)
	{
		UE_LOG(LogKKGen, Error, TEXT("GenerateLayout ohne Etagendefinition aufgerufen."));
		return Layout;
	}

	FRandomStream Stream(Seed);
	const int32 GridSize = UKKGameSettings::Get().GridSize;

	Layout.Floor = FloorData->Floor;
	Layout.StartCoord = FKKGridCoord(0, 0);

	const int32 TargetRooms = Stream.RandRange(FloorData->MinRooms, FloorData->MaxRooms)
		+ FloorData->RoomsPerNGPlus * FMath::Max(0, NewGamePlusLevel);

	CarveRooms(Layout, Stream, TargetRooms, GridSize);
	ComputeDistances(Layout);

	TArray<FKKGridCoord> DeadEnds = CollectDeadEnds(Layout);

	PlaceBossRoom(Layout, DeadEnds);
	PlaceSpecialRooms(Layout, DeadEnds, FloorData, Stream);
	PlaceSecretRooms(Layout, FloorData, Stream, GridSize);

	// Erst ganz am Ende, weil Geheimraeume die Nachbarschaft veraendern.
	ComputeDoorMasks(Layout);
	AssignRoomAssets(Layout, Stream, Registry, Save);

	UE_LOG(LogKKGen, Log, TEXT("Etage %d erzeugt: %d Raeume (Ziel %d), Seed %d"),
		static_cast<int32>(Layout.Floor), Layout.Num(), TargetRooms, Seed);

	return Layout;
}

void UKKFloorGenerator::CarveRooms(FKKFloorLayout& Layout, FRandomStream& Stream, int32 TargetRooms, int32 GridSize)
{
	FKKRoomNode Start;
	Start.Coord = Layout.StartCoord;
	Start.Type = EKKRoomType::Start;
	Layout.Nodes.Add(Start.Coord, Start);

	TArray<FKKGridCoord> Frontier;
	Frontier.Add(Start.Coord);

	int32 Guard = 0;
	while (Layout.Nodes.Num() < TargetRooms && Guard++ < 10000)
	{
		if (Frontier.Num() == 0)
		{
			// Kein Rand mehr uebrig: bestehende Raeume noch einmal als Ausgangspunkte nehmen.
			for (const TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
			{
				Frontier.Add(Pair.Key);
			}
			if (Frontier.Num() == 0)
			{
				break;
			}
		}

		const int32 Index = Stream.RandRange(0, Frontier.Num() - 1);
		const FKKGridCoord Current = Frontier[Index];
		Frontier.RemoveAtSwap(Index);

		for (EKKDir Dir : KKDir::All)
		{
			if (Layout.Nodes.Num() >= TargetRooms)
			{
				break;
			}

			const FKKGridCoord Candidate = Current.Offset(Dir);

			if (!IsInsideGrid(Candidate, GridSize) || Layout.Nodes.Contains(Candidate))
			{
				continue;
			}

			// Kernregel: Ein neuer Raum darf nur an genau einen bestehenden Raum grenzen.
			// Dadurch entstehen Aeste und Sackgassen statt eines offenen Rechtecks -
			// und Sackgassen sind es, an denen spaeter Schatz, Laden und Boss liegen.
			if (CountNeighbours(Layout, Candidate) > 1)
			{
				continue;
			}

			// Nicht jede Moeglichkeit wird genutzt; das erzeugt die unregelmaessige Form.
			if (Stream.FRand() < 0.42f)
			{
				continue;
			}

			FKKRoomNode Node;
			Node.Coord = Candidate;
			Node.Type = EKKRoomType::Kampf;
			Layout.Nodes.Add(Candidate, Node);
			Frontier.Add(Candidate);
		}
	}
}

void UKKFloorGenerator::ComputeDistances(FKKFloorLayout& Layout)
{
	for (TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
	{
		Pair.Value.Distance = TNumericLimits<int32>::Max();
	}

	TQueue<FKKGridCoord> Queue;
	Queue.Enqueue(Layout.StartCoord);
	if (FKKRoomNode* StartNode = Layout.Nodes.Find(Layout.StartCoord))
	{
		StartNode->Distance = 0;
	}

	FKKGridCoord Current;
	while (Queue.Dequeue(Current))
	{
		const FKKRoomNode* CurrentNode = Layout.Nodes.Find(Current);
		if (!CurrentNode)
		{
			continue;
		}
		const int32 NextDistance = CurrentNode->Distance + 1;

		for (EKKDir Dir : KKDir::All)
		{
			const FKKGridCoord Neighbour = Current.Offset(Dir);
			if (FKKRoomNode* NeighbourNode = Layout.Nodes.Find(Neighbour))
			{
				if (NextDistance < NeighbourNode->Distance)
				{
					NeighbourNode->Distance = NextDistance;
					Queue.Enqueue(Neighbour);
				}
			}
		}
	}
}

void UKKFloorGenerator::ComputeDoorMasks(FKKFloorLayout& Layout)
{
	for (TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
	{
		uint8 Mask = 0;
		for (EKKDir Dir : KKDir::All)
		{
			const FKKRoomNode* Neighbour = Layout.Nodes.Find(Pair.Key.Offset(Dir));
			if (!Neighbour)
			{
				continue;
			}

			// Zu einem Geheimraum fuehrt keine Tuer, sondern eine sprengbare Wand.
			// Die Verbindung wird trotzdem in der Maske vermerkt, damit der Raum eine
			// Oeffnung an der richtigen Seite bekommt.
			Mask |= (1 << static_cast<uint8>(Dir));
		}
		Pair.Value.DoorMask = Mask;
	}
}

TArray<FKKGridCoord> UKKFloorGenerator::CollectDeadEnds(const FKKFloorLayout& Layout) const
{
	TArray<FKKGridCoord> DeadEnds;
	for (const TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
	{
		if (Pair.Key == Layout.StartCoord)
		{
			continue;
		}
		if (CountNeighbours(Layout, Pair.Key) == 1)
		{
			DeadEnds.Add(Pair.Key);
		}
	}

	// Die entferntesten Sackgassen zuerst - dort liegen die wertvollsten Raeume.
	DeadEnds.Sort([&Layout](const FKKGridCoord& A, const FKKGridCoord& B)
	{
		const FKKRoomNode* NodeA = Layout.Nodes.Find(A);
		const FKKRoomNode* NodeB = Layout.Nodes.Find(B);
		return (NodeA ? NodeA->Distance : 0) > (NodeB ? NodeB->Distance : 0);
	});

	return DeadEnds;
}

void UKKFloorGenerator::PlaceBossRoom(FKKFloorLayout& Layout, TArray<FKKGridCoord>& DeadEnds)
{
	if (DeadEnds.Num() == 0)
	{
		// Notfall: der am weitesten entfernte Raum wird zum Bossraum.
		FKKGridCoord Best = Layout.StartCoord;
		int32 BestDistance = -1;
		for (const TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
		{
			if (Pair.Value.Distance > BestDistance && Pair.Value.Distance < TNumericLimits<int32>::Max())
			{
				BestDistance = Pair.Value.Distance;
				Best = Pair.Key;
			}
		}
		Layout.BossCoord = Best;
	}
	else
	{
		Layout.BossCoord = DeadEnds[0];
		DeadEnds.RemoveAt(0);
	}

	if (FKKRoomNode* Node = Layout.Nodes.Find(Layout.BossCoord))
	{
		Node->Type = EKKRoomType::Boss;
	}
}

void UKKFloorGenerator::PlaceSpecialRooms(FKKFloorLayout& Layout, TArray<FKKGridCoord>& DeadEnds,
	const UKKFloorData* FloorData, FRandomStream& Stream)
{
	// Reihenfolge = Wichtigkeit. Was zuerst kommt, bekommt die besseren Plaetze.
	struct FRequest { EKKRoomType Type; int32 Count; };
	const TArray<FRequest> Requests = {
		{ EKKRoomType::Schatz,     FloorData->TreasureRooms },
		{ EKKRoomType::Haendler,   FloorData->ShopRooms },
		{ EKKRoomType::SafeRoom,   FloorData->SafeRooms },
		{ EKKRoomType::MiniBoss,   FloorData->MiniBossRooms },
		{ EKKRoomType::Challenge,  FloorData->ChallengeRooms },
		{ EKKRoomType::Story,      FloorData->StoryRooms },
		{ EKKRoomType::Raetsel,    FloorData->PuzzleRooms },
		{ EKKRoomType::Event,      FloorData->EventRooms },
		{ EKKRoomType::Verflucht,  FloorData->CursedRooms },
		{ EKKRoomType::Opfer,      FloorData->SacrificeRooms },
	};

	for (const FRequest& Request : Requests)
	{
		for (int32 i = 0; i < Request.Count; ++i)
		{
			if (DeadEnds.Num() > 0)
			{
				const FKKGridCoord Coord = DeadEnds[0];
				DeadEnds.RemoveAt(0);
				if (FKKRoomNode* Node = Layout.Nodes.Find(Coord))
				{
					Node->Type = Request.Type;
				}
				continue;
			}

			// Keine Sackgasse mehr frei: einen moeglichst weit entfernten normalen
			// Kampfraum umwidmen, damit der Sonderraum nicht direkt am Start liegt.
			FKKGridCoord Best;
			int32 BestDistance = -1;
			for (const TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
			{
				if (Pair.Value.Type != EKKRoomType::Kampf)
				{
					continue;
				}
				if (Pair.Value.Distance > BestDistance)
				{
					BestDistance = Pair.Value.Distance;
					Best = Pair.Key;
				}
			}

			if (BestDistance < 0)
			{
				break;
			}
			if (FKKRoomNode* Node = Layout.Nodes.Find(Best))
			{
				Node->Type = Request.Type;
			}
		}
	}

	// Alternativer Weg: eine zweite Treppe an einer anderen weit entfernten Sackgasse.
	if (FloorData->bHasAlternatePath && DeadEnds.Num() > 0)
	{
		const FKKGridCoord Coord = DeadEnds[0];
		DeadEnds.RemoveAt(0);
		if (FKKRoomNode* Node = Layout.Nodes.Find(Coord))
		{
			Node->Type = EKKRoomType::Treppe;
		}
	}
}

void UKKFloorGenerator::PlaceSecretRooms(FKKFloorLayout& Layout, const UKKFloorData* FloorData,
	FRandomStream& Stream, int32 GridSize)
{
	// Kandidaten sind leere Zellen. Ein guter Geheimraum liegt zwischen mehreren
	// bekannten Raeumen - so hat der Spieler eine echte Chance, ihn zu erschliessen.
	auto FindCandidate = [&](int32 MinNeighbours, int32 MaxNeighbours, bool bFarFromStart) -> bool
	{
		TArray<FKKGridCoord> Candidates;
		const int32 Half = GridSize / 2;

		for (int32 X = -Half; X <= Half; ++X)
		{
			for (int32 Y = -Half; Y <= Half; ++Y)
			{
				const FKKGridCoord Coord(X, Y);
				if (Layout.Nodes.Contains(Coord))
				{
					continue;
				}

				const int32 Neighbours = CountNeighbours(Layout, Coord);
				if (Neighbours < MinNeighbours || Neighbours > MaxNeighbours)
				{
					continue;
				}

				// Nie direkt am Bossraum oder am Start - beide sollen keine Abkuerzung bekommen.
				bool bTouchesForbidden = false;
				for (EKKDir Dir : KKDir::All)
				{
					const FKKGridCoord Neighbour = Coord.Offset(Dir);
					if (Neighbour == Layout.BossCoord || Neighbour == Layout.StartCoord)
					{
						bTouchesForbidden = true;
						break;
					}
				}
				if (bTouchesForbidden)
				{
					continue;
				}

				Candidates.Add(Coord);
			}
		}

		if (Candidates.Num() == 0)
		{
			return false;
		}

		if (bFarFromStart)
		{
			Candidates.Sort([&Layout](const FKKGridCoord& A, const FKKGridCoord& B)
			{
				const int32 DistA = FMath::Abs(A.X - Layout.StartCoord.X) + FMath::Abs(A.Y - Layout.StartCoord.Y);
				const int32 DistB = FMath::Abs(B.X - Layout.StartCoord.X) + FMath::Abs(B.Y - Layout.StartCoord.Y);
				return DistA > DistB;
			});
		}

		const int32 Index = bFarFromStart ? 0 : Stream.RandRange(0, Candidates.Num() - 1);

		FKKRoomNode Node;
		Node.Coord = Candidates[Index];
		Node.Type = (MinNeighbours >= 3) ? EKKRoomType::Geheim : EKKRoomType::SuperGeheim;
		Node.bHidden = true;
		Layout.Nodes.Add(Node.Coord, Node);
		return true;
	};

	for (int32 i = 0; i < FloorData->SecretRooms; ++i)
	{
		// Erst der gute Platz mit drei Nachbarn, sonst mit zweien.
		if (!FindCandidate(3, 4, false))
		{
			FindCandidate(2, 4, false);
		}
	}

	for (int32 i = 0; i < FloorData->SuperSecretRooms; ++i)
	{
		// Der Super-Geheimraum haengt bewusst an nur einem Raum, moeglichst weit weg.
		FindCandidate(1, 1, true);
	}

	ComputeDistances(Layout);
}

void UKKFloorGenerator::AssignRoomAssets(FKKFloorLayout& Layout, FRandomStream& Stream,
	UKKContentRegistry* Registry, const UKKSaveGame* Save)
{
	if (!Registry)
	{
		return;
	}

	for (TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
	{
		FKKRoomNode& Node = Pair.Value;

		TArray<UKKRoomData*> Candidates = Registry->GetRooms(Layout.Floor, Node.Type, Save);

		// Nur Raeume, die alle benoetigten Ausgaenge besitzen.
		Candidates.RemoveAll([&Node](const UKKRoomData* Room)
		{
			return !Room || !Room->Fits(Node.DoorMask);
		});

		if (Candidates.Num() == 0)
		{
			UE_LOG(LogKKGen, Warning,
				TEXT("Kein passender Raum fuer Typ %d mit Tuermaske %d auf Etage %d."),
				static_cast<int32>(Node.Type), Node.DoorMask, static_cast<int32>(Layout.Floor));
			continue;
		}

		float Total = 0.f;
		for (const UKKRoomData* Room : Candidates)
		{
			Total += FMath::Max(0.01f, Room->Weight);
		}

		float Pick = Stream.FRandRange(0.f, Total);
		for (UKKRoomData* Room : Candidates)
		{
			Pick -= FMath::Max(0.01f, Room->Weight);
			if (Pick <= 0.f)
			{
				Node.RoomData = Room;
				break;
			}
		}
		if (!Node.RoomData)
		{
			Node.RoomData = Candidates.Last();
		}
	}
}

void UKKFloorGenerator::SpawnLayout(UObject* WorldContext, const FKKFloorLayout& Layout)
{
	UWorld* World = GEngine ? GEngine->GetWorldFromContextObject(WorldContext, EGetWorldErrorMode::ReturnNull) : nullptr;
	if (!World)
	{
		return;
	}

	for (const TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
	{
		const FKKRoomNode& Node = Pair.Value;
		if (!Node.RoomData || Node.RoomData->RoomLevel.IsNull())
		{
			continue;
		}

		bool bSuccess = false;
		ULevelStreamingDynamic::LoadLevelInstanceBySoftObjectPtr(
			World,
			Node.RoomData->RoomLevel,
			CoordToWorld(Node.Coord),
			FRotator::ZeroRotator,
			bSuccess,
			FString::Printf(TEXT("KK_%d_%d"), Node.Coord.X, Node.Coord.Y));

		if (!bSuccess)
		{
			UE_LOG(LogKKGen, Error, TEXT("Raumlevel %s konnte nicht geladen werden."),
				*Node.RoomData->RoomId.ToString());
		}
	}
}

FString UKKFloorGenerator::DescribeLayout(const FKKFloorLayout& Layout)
{
	if (Layout.Num() == 0)
	{
		return TEXT("(leere Etage)");
	}

	int32 MinX = TNumericLimits<int32>::Max(), MaxX = TNumericLimits<int32>::Min();
	int32 MinY = TNumericLimits<int32>::Max(), MaxY = TNumericLimits<int32>::Min();
	for (const TPair<FKKGridCoord, FKKRoomNode>& Pair : Layout.Nodes)
	{
		MinX = FMath::Min(MinX, Pair.Key.X);
		MaxX = FMath::Max(MaxX, Pair.Key.X);
		MinY = FMath::Min(MinY, Pair.Key.Y);
		MaxY = FMath::Max(MaxY, Pair.Key.Y);
	}

	auto Symbol = [](EKKRoomType Type) -> TCHAR
	{
		switch (Type)
		{
		case EKKRoomType::Start:       return TEXT('S');
		case EKKRoomType::Boss:        return TEXT('B');
		case EKKRoomType::Schatz:      return TEXT('T');
		case EKKRoomType::Haendler:    return TEXT('$');
		case EKKRoomType::Geheim:      return TEXT('?');
		case EKKRoomType::SuperGeheim: return TEXT('!');
		case EKKRoomType::SafeRoom:    return TEXT('+');
		case EKKRoomType::MiniBoss:    return TEXT('m');
		case EKKRoomType::Challenge:   return TEXT('C');
		case EKKRoomType::Story:       return TEXT('s');
		case EKKRoomType::Raetsel:     return TEXT('R');
		case EKKRoomType::Event:       return TEXT('E');
		case EKKRoomType::Verflucht:   return TEXT('X');
		case EKKRoomType::Opfer:       return TEXT('O');
		case EKKRoomType::Treppe:      return TEXT('>');
		default:                       return TEXT('#');
		}
	};

	FString Result;
	for (int32 Y = MinY; Y <= MaxY; ++Y)
	{
		for (int32 X = MinX; X <= MaxX; ++X)
		{
			const FKKRoomNode* Node = Layout.Find(FKKGridCoord(X, Y));
			Result.AppendChar(Node ? Symbol(Node->Type) : TEXT('.'));
		}
		Result.AppendChar(TEXT('\n'));
	}
	return Result;
}
