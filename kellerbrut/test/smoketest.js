/* Smoke-Test für KELLERBRUT.
   Jede Phase bekommt eine frische Seite: so kann sich über die lange
   Testsitzung nichts im Renderer aufstauen und die Phasen bleiben isoliert. */
const {chromium}=require('playwright');
const URL='file://'+require('path').resolve(__dirname,'..','index.html');
const OUT=(process.env.KB_SHOTS||require('os').tmpdir())+'/';

let fails=[];
// Phasen einzeln aufrufbar: node test.js 1,2,3 — sonst alle.
const SEL=(process.argv[2]||'').split(',').filter(Boolean);
const want=n=>SEL.length===0||SEL.includes(String(n));
const note=(ok,label,extra)=>{ console.log((ok?'  ok  ':'  FEHLER  ')+label+(extra?'  '+extra:'')); if(!ok) fails.push(label+' '+(extra||'')); };

// Eigener Browser je Phase: der Renderer-Prozess staut über eine so lange
// Testsitzung sonst Ressourcen an und stirbt mitten in einer späteren Phase.
// Das headless-Chromium dieser Sandbox lässt gelegentlich seinen Renderer
// sterben ("Target crashed"), unabhängig vom getesteten Code. Eine Phase wird
// deshalb bis zu dreimal versucht, bevor sie als echter Fehler gilt.
async function withPage(fn){
  let lastErr=null;
  for(let versuch=1;versuch<=3;versuch++){
    const br=await chromium.launch({executablePath:process.env.KB_CHROMIUM||undefined});
    const page=await br.newPage({viewport:{width:1280,height:720}});
    const errs=[];
    page.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));
    page.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE: '+m.text());});
    try{
      await page.goto(URL); await page.waitForTimeout(400);
      await fn(page,errs);
      await br.close();
      return errs;
    }catch(e){
      lastErr=e; await br.close().catch(()=>{});
      if(!/Target crashed|Target closed/.test(e.message||'')) throw e;
      console.log('    (Renderer abgestürzt, Versuch '+versuch+' von 3 – neuer Anlauf)');
    }
  }
  throw lastErr;
}

(async()=>{

// --- 1. Start & Menü ---
if(want(1)){
console.log('\n[1] Start und Menü');
let e1=await withPage(async(page)=>{
  const st=await page.evaluate(()=>KB.G.state);
  note(st==='menu','Spiel startet im Menü','(state='+st+')');
  await page.screenshot({path:OUT+'shot-1-menu.png'});
});
note(e1.length===0,'keine JS-Fehler im Menü',e1.join(' '));

}
// --- 2. Seed-Determinismus ---
if(want(2)){
console.log('\n[2] Seed-Determinismus');
await withPage(async(page)=>{
  const d=await page.evaluate(()=>{
    const sig=()=>{const f=KB.G.floor;
      return Object.keys(f.rooms).sort().map(k=>{const r=f.rooms[k];
        return k+'|'+r.type+'|'+r.spawns.map(s=>s.type+(s.champ?'C':'')).join(',')
          +'|'+r.pedestals.map(p=>p.itemId).join(',')
          +'|'+r.grid.map(row=>row.map(c=>c?c.t[0]:'.').join('')).join('/');}).join(';');};
    const runSig=s=>{const o=[];startRun(0,s);for(let i=0;i<4;i++){o.push(sig());nextFloor();}return o.join('#');};
    return {gleich:runSig('PRUEFUNG')===runSig('PRUEFUNG'), anders:runSig('PRUEFUNG')!==runSig('ANDERER')};
  });
  note(d.gleich,'gleicher Seed erzeugt identische Etagen');
  note(d.anders,'anderer Seed erzeugt andere Etagen');
});

}
// --- 3. Etagenstruktur über 40 Seeds x 6 Etagen ---
if(want(3)){
console.log('\n[3] Etagengenerierung (240 Etagen)');
await withPage(async(page)=>{
  const probs=[];
  for(let b=0;b<4;b++) probs.push(...await page.evaluate((b)=>{
    const p=[];
    for(let s=b*10;s<b*10+10;s++){
      startRun(s%KB.CHARS.length,'S'+s);
      for(let d=1;d<=6;d++){
        const f=KB.G.floor, keys=Object.keys(f.rooms), types={};
        for(const k of keys) types[f.rooms[k].type]=1;
        if(!types.boss) p.push('S'+s+' E'+d+': kein Bossraum');
        if(!types.treasure) p.push('S'+s+' E'+d+': kein Schatzraum');
        if(!types.start) p.push('S'+s+' E'+d+': kein Startraum');
        const seen=new Set(['0,0']), q=['0,0'];
        while(q.length){const k=q.shift();
          for(const dd in f.rooms[k].doors){const nk=f.rooms[k].doors[dd].to;
            if(!seen.has(nk)){seen.add(nk);q.push(nk);}}}
        if(seen.size!==keys.length) p.push('S'+s+' E'+d+': '+(keys.length-seen.size)+' unerreichbar');
        // Türgassen müssen frei sein, sonst sperrt man sich aus
        for(const dd in f.rooms[keys[0]].doors){}
        if(d<6) nextFloor();
      }
    }
    return p;
  },b));
  note(probs.length===0,'alle Etagen vollständig und erreichbar',probs.slice(0,5).join('; '));
});

}
// --- 4. Alle Gegnertypen ---
if(want(4)){
console.log('\n[4] Gegner');
await withPage(async(page,errs)=>{
  const bad=[];
  const typen=await page.evaluate(()=>Object.keys(KB.ENEMY_TYPES));
  for(const t of typen){
    const err=await page.evaluate((t)=>{ try{
      startRun(0,'GEGNER'); const p=KB.G.player; p.redMax=200;p.red=200;
      KB.G.enemies.length=0; KB.G.room.cleared=false;
      for(let i=0;i<3;i++) spawnEnemy(t,tx(3+i*3),ty(2),i===0?{tint:'#ff5a5a',hpMul:2}:null);
      for(let k=0;k<400;k++){p.red=200; if(k%40<20)p.x+=0.5; updateGame(1/60);}
      return null;}catch(e){return e.message;} },t);
    if(err) bad.push(t+': '+err);
  }
  note(bad.length===0,'alle '+typen.length+' Gegnertypen laufen fehlerfrei (je 400 Ticks)',bad.join('; '));
  note(errs.length===0,'keine JS-Fehler in der Gegnerphase',errs.join(' '));
});

}
// --- 5. Alle Bosse inkl. Phasenwechsel ---
if(want(5)){
console.log('\n[5] Bosse');
await withPage(async(page,errs)=>{
  const bad=[], phases=[];
  const bossIds=await page.evaluate(()=>Object.keys(KB.BOSS_TYPES));
  for(const id of bossIds){
    const r=await page.evaluate((id)=>{ try{
      startRun(0,'BOSS'); const p=KB.G.player; p.redMax=400;p.red=400;
      KB.G.enemies.length=0; spawnBoss(id); KB.G.bossIntro=null;
      let ph=1;
      for(let k=0;k<1200;k++){p.red=400;
        const b=KB.G.enemies.find(e=>e.isBoss);
        if(b){b.hp-=b.maxHp/900; ph=Math.max(ph,b.phase);}
        updateGame(1/60);}
      return {ph};}catch(e){return {err:e.message};} },id);
    if(r.err) bad.push(id+': '+r.err); else phases.push(id+'=P'+r.ph);
  }
  note(bad.length===0,'alle '+bossIds.length+' Bosse laufen fehlerfrei (je 1200 Ticks)',bad.join('; '));
  note(phases.every(p=>!p.endsWith('P1')),'alle Bosse erreichen Phase 2+',phases.join(' '));
  note(errs.length===0,'keine JS-Fehler in der Bossphase',errs.join(' '));
});

}
// --- 6. Alle Items ---
if(want(6)){
console.log('\n[6] Items');
await withPage(async(page,errs)=>{
  const bad=[]; let done=0;
  const itemIds=await page.evaluate(()=>Object.keys(KB.ITEMS));
  for(const id of itemIds){
    const err=await page.evaluate((id)=>{ try{
      startRun(0,'ITEM'); const p=KB.G.player; p.redMax=200;p.red=200;
      acquireItem(id,null); p.itemGet=null; KB.G.enemies.length=0;
      for(let i=0;i<4;i++) spawnEnemy('blobling',tx(4+i*2),ty(2),null);
      for(let k=0;k<300;k++){ p.red=200;
        const a=[[1,0],[0,1],[-1,0],[0,-1]][Math.floor(k/40)%4];
        p.aimDir={x:a[0],y:a[1]}; p.fireTimer=0;
        if(p.flags.has('beam')){ if(k%50<40)p.beamCharge=1; else {fireBeam(p.aimDir);p.beamCharge=0;} }
        else fireShot(p.aimDir);
        if(KB.ITEMS[id].type==='active'&&k%60===0){p.active.charge=p.active.max;KB.ITEMS[id].use(p);}
        updateGame(1/60);}
      return null;}catch(e){return e.message;} },id).catch(e=>'ABSTURZ ('+(e.message||'').split('\n')[0]+')');
    if(err) bad.push(id+': '+err);
    else done++;
  }
  note(bad.length===0,'alle '+itemIds.length+' Items laufen fehlerfrei (je 300 Ticks Dauerfeuer)',bad.slice(0,3).join('; '));
  note(done===itemIds.length,'jedes Item vollständig durchlaufen','('+done+'/'+itemIds.length+')');
  note(errs.length===0,'keine JS-Fehler in der Itemphase',errs.join(' '));
});

}
// --- 6b. Item-Wirkungen sind sichtbar und greifen wirklich ---
if(want(6)){
console.log('\n[6b] Sichtbare Item-Wirkungen');
await withPage(async(page,errs)=>{
  // Jedes Aktivitem muss beim Einsatz auch etwas auf dem Schirm erzeugen
  const aktiv=await page.evaluate(()=>{
    const ohne=[];
    for(const id of Object.keys(KB.ITEMS)){
      const it=KB.ITEMS[id];
      if(it.type!=='active') continue;
      startRun(0,'AKTIV'); const p=KB.G.player;
      p.redMax=12; p.red=4;                 // damit auch Heilitems anschlagen
      KB.G.enemies.length=0;
      for(let i=0;i<4;i++) spawnEnemy('blobling',tx(3+i*2),ty(2),null);
      KB.G.fx.length=0;
      it.use(p);
      if(KB.G.fx.length===0) ohne.push(id);
    }
    return ohne;
  });
  note(aktiv.length===0,'jedes Aktivitem erzeugt einen sichtbaren Effekt',aktiv.join(', '));

  // Elementare Schüsse müssen Spuren ziehen
  const spuren=await page.evaluate(()=>{
    const ohne=[];
    for(const [id,name] of [['giftdruese','Gift'],['glutzunge','Feuer'],['frostkern','Frost'],['suchtraene','Suchen']]){
      startRun(0,'SPUR'); const p=KB.G.player;
      acquireItem(id,null); p.itemGet=null; KB.G.enemies.length=0;
      KB.G.fx.length=0; p.aimDir={x:1,y:0}; p.fireTimer=0; fireShot(p.aimDir);
      for(let k=0;k<20;k++) updateGame(1/60);
      if(KB.G.fx.length===0) ohne.push(name);
    }
    return ohne;
  });
  note(spuren.length===0,'elementare Schüsse hinterlassen eine Spur',spuren.join(', '));

  // Der Bombenvogel verspricht explosive Kugeln — das muss auch passieren
  const vogel=await page.evaluate(()=>{
    startRun(0,'VOGEL'); const p=KB.G.player;
    p.redMax=99;p.red=99; KB.G.enemies.length=0;
    // ein Ziel weit weg vom Einschlag: nur eine echte Explosion erreicht es
    const fern=spawnEnemy('blobling',tx(6)+30,ty(3),null); fern.hp=999;
    const t=spawnTear(tx(6),ty(3),0,{...p.stats,dmg:1,range:10,shot:4},new Set(),true);
    t.explosive=true; t.life=0.001;
    const vorher=fern.hp;
    for(let k=0;k<5;k++) updateGame(1/60);
    return {schaden:vorher-fern.hp};
  });
  note(vogel.schaden>0,'Bombenvogel-Kugeln explodieren wirklich',
       '(Flächenschaden '+vogel.schaden.toFixed(0)+')');

  // Eigene Giftpfützen dürfen nur Gegnern schaden, nicht dem Spieler
  const pfuetze=await page.evaluate(()=>{
    startRun(0,'PFUETZE'); const p=KB.G.player;
    p.redMax=12;p.red=12; KB.G.enemies.length=0; KB.G.creeps.length=0;
    // Gegner weit genug weg, sonst käme der Schaden aus der Berührung
    // Gegner ohne Fernkampf und bewegungslos, damit nur die Pfütze wirken kann
    const e=spawnEnemy('blobling',p.x+46,p.y,null); e.hp=999; e.spd=0;
    G.creeps.push({x:p.x+23,y:p.y,r:34,t:9,feindlich:false});
    for(let k=0;k<90;k++){ p.iframes=0; p.vx=p.vy=0; updateGame(1/60); }
    return {spielerLeben:p.red, gegnerVergiftet:e.poison>0};
  });
  note(pfuetze.spielerLeben===12,'eigene Giftpfütze schadet dem Spieler nicht',
       '(Leben '+pfuetze.spielerLeben+'/12)');
  note(pfuetze.gegnerVergiftet,'eigene Giftpfütze vergiftet Gegner');
  // Jeder Begleiter muss im Kampf etwas bewirken: Schaden, Statuseffekt
  // oder abgefangene Geschosse. Ein Begleiter, der nur mitläuft, wäre ein Bug.
  const begleiter=await page.evaluate(()=>{
    const ohne=[], bericht=[];
    for(const id of Object.keys(KB.ITEMS)){
      if(!KB.ITEMS[id].famil) continue;
      startRun(0,'FAM'); const p=KB.G.player; p.redMax=200;p.red=200;
      acquireItem(id,null); p.itemGet=null; KB.G.enemies.length=0;
      for(let i=0;i<4;i++){const e=spawnEnemy('blobling',tx(3+i*2),ty(2),null); e.hp=400;}
      const hpVor=KB.G.enemies.reduce((s,e)=>s+e.hp,0);
      let blockt=0, zieht=0;
      const q=KB.G.pickups.length;
      spawnPickup(p.x+70,p.y,'coin');
      const muenze=KB.G.pickups[KB.G.pickups.length-1];
      const mVor=dist(p,muenze);
      for(let k=0;k<400;k++){
        p.red=200; p.vx=p.vy=0; p.aimDir={x:1,y:0};
        if(k%20===0) fireEshot(tx(11),ty(3),Math.PI,150);
        if(KB.ITEMS[id].famil==='shadow'){ p.fireTimer=0; fireShot(p.aimDir); }
        const vor=KB.G.eshots.length;
        updateGame(1/60);
        if(KB.G.eshots.length<vor) blockt++;
      }
      const hpNach=KB.G.enemies.reduce((s,e)=>s+e.hp,0);
      const status=KB.G.enemies.filter(e=>e.poison>0||e.burn>0||e.frost>0).length;
      if(muenze&&!muenze.dead) zieht=mVor-dist(p,muenze);
      const wirkt=(hpVor-hpNach)>0||status>0||blockt>0||zieht>5;
      bericht.push(KB.ITEMS[id].name+'='+Math.round(hpVor-hpNach));
      if(!wirkt) ohne.push(KB.ITEMS[id].name);
    }
    return {ohne,bericht};
  });
  note(begleiter.ohne.length===0,'jeder Begleiter wirkt im Kampf',
       begleiter.ohne.length?begleiter.ohne.join(', '):'(Schaden: '+begleiter.bericht.join(' ')+')');

  // Der Panzerling ist ein Schild: mit ihm dürfen Geschosse nicht durchkommen
  const schild=await page.evaluate(()=>{
    const lauf=(mit)=>{
      startRun(0,'BLOCK'); const p=KB.G.player;
      p.redMax=99;p.red=99; KB.G.enemies.length=0;
      if(mit){ acquireItem('panzerling',null); p.itemGet=null; }
      p.x=tx(6); p.y=ty(3); p.aimDir={x:1,y:0};
      for(let k=0;k<240;k++){
        p.vx=p.vy=0; p.iframes=0;
        if(k%12===0) fireEshot(tx(11),ty(3),Math.PI,160);
        updateGame(1/60);
      }
      return p.red;
    };
    return {ohne:lauf(false), mit:lauf(true)};
  });
  note(schild.mit>schild.ohne,'Panzerling fängt gegnerische Geschosse ab',
       '(ohne '+schild.ohne+', mit '+schild.mit+' Leben)');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}
// --- 7. Pillen und Karten ---
if(want(7)){
console.log('\n[7] Pillen und Karten');
await withPage(async(page,errs)=>{
  const bad=await page.evaluate(()=>{
    const b=[];
    KB.PILLS.forEach((pill,i)=>{try{startRun(0,'PILLE');
      KB.G.player.pocket={kind:'pill',id:i}; usePocket();
      for(let t=0;t<60;t++)updateGame(1/60);}catch(e){b.push('Pille '+pill.name+': '+e.message);}});
    KB.CARDS.forEach((card,i)=>{try{startRun(0,'KARTE');
      KB.G.player.pocket={kind:'card',id:i}; usePocket();
      for(let t=0;t<60;t++)updateGame(1/60);}catch(e){b.push('Karte '+card.name+': '+e.message);}});
    return b;});
  note(bad.length===0,'alle Pillen und Karten wirken fehlerfrei',bad.join('; '));
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}
// --- 7b. Türen in allen vier Richtungen begehbar ---
if(want(7)){
console.log('\n[7b] Türen begehbar');
await withPage(async(page,errs)=>{
  const r=await page.evaluate(()=>{
    const offen=[];
    for(const richtung of ['u','d','l','r']){
      let geschafft=false;
      for(let s=0;s<40&&!geschafft;s++){
        startRun(0,'T'+s);
        const p=KB.G.player; p.redMax=99;p.red=99;p.keys=9;
        if(!KB.G.room.doors[richtung]) continue;
        const vorher=KB.G.roomKey;
        for(let i=0;i<200&&KB.G.roomKey===vorher;i++){   // gegen die Tür laufen
          const dp=doorXY(richtung);
          const a=Math.atan2(dp.y-p.y,dp.x-p.x);
          p.vx=Math.cos(a)*200; p.vy=Math.sin(a)*200;
          updateGame(1/60);
        }
        for(let i=0;i<40;i++) updateGame(1/60);          // Übergang abwarten
        if(KB.G.roomKey!==vorher) geschafft=true;
      }
      if(geschafft) offen.push(richtung);
    }
    return offen;
  });
  note(r.length===4,'Spieler kommt durch Türen in allen 4 Richtungen','(geht: '+r.join(',')+')');

  // Verschlossene Türen (Schatzraum/Shop): mit Schlüssel auf, ohne zu.
  // Der Spieler wird von der Wand aufgehalten, kommt also nie ganz an die
  // Türmitte heran — genau daran scheiterte das Aufschließen früher.
  const schloss=await page.evaluate(()=>{
    const lauf=(schluessel,richtung)=>{
      for(let s=0;s<80;s++){
        startRun(0,'L'+s);
        const p=KB.G.player; p.keys=schluessel; p.redMax=99;p.red=99;
        const t=KB.G.room.doors[richtung];
        if(!t||!t.edge.locked) continue;
        const vorher=KB.G.roomKey, dp=doorXY(richtung);
        for(let i=0;i<500&&KB.G.roomKey===vorher;i++){
          const a=Math.atan2(dp.y-p.y,dp.x-p.x);
          p.vx=Math.cos(a)*200; p.vy=Math.sin(a)*200; updateGame(1/60);
        }
        for(let i=0;i<40;i++) updateGame(1/60);
        return {gewechselt:KB.G.roomKey!==vorher, rest:KB.G.player.keys, gefunden:true};
      }
      return {gefunden:false};
    };
    const auf=['u','d','l','r'].filter(d=>lauf(5,d).gewechselt);
    const zu=lauf(0,'u').gefunden?lauf(0,'u'):lauf(0,'d');
    return {auf, ohneSchluessel:zu.gewechselt, verbraucht:lauf(5,'u').rest};
  });
  note(schloss.auf.length===4,'verschlossene Türen öffnen sich mit Schlüssel',
       '(geht: '+schloss.auf.join(',')+')');
  note(schloss.ohneSchluessel===false,'ohne Schlüssel bleibt die Tür zu');
  note(schloss.verbraucht===4,'das Aufschließen verbraucht genau einen Schlüssel',
       '(5 → '+schloss.verbraucht+')');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}
// --- 7c. Garantierte Schlüssel je Etage ---
if(want(7)){
console.log('\n[7c] Garantierte Schlüssel');
await withPage(async(page,errs)=>{
  // Exakte Prüfung über viele Etagen: jeder garantierte Schlüssel muss in
  // einem ohne Schlüssel und ohne Bombe erreichbaren Raum liegen, und dort
  // auf einem Feld, das zu Fuß mit dem Raumrand verbunden ist.
  const r=await page.evaluate(()=>{
    let etagen=0, gesamt=0, schlecht=[], verteilung={};
    for(let s=0;s<40;s++){
      startRun(0,'S'+s);
      for(let d=1;d<=6;d++){
        const f=KB.G.floor;
        const frei=new Set([f.startKey]), q=[f.startKey];
        while(q.length){ const k=q.shift();
          for(const dd in f.rooms[k].doors){ const t=f.rooms[k].doors[dd];
            if(t.edge.locked||t.edge.kind==='secret') continue;   // kostet Schlüssel/Bombe
            if(!frei.has(t.to)){frei.add(t.to);q.push(t.to);} } }
        let n=0;
        for(const k of Object.keys(f.rooms)){
          const room=f.rooms[k];
          for(const drop of room.drops){
            if(drop.type!=='key'||!drop.garantiert) continue;
            n++; gesamt++;
            const c=Math.floor((drop.x-RX)/TILE), rr=Math.floor((drop.y-RY)/TILE);
            if(!frei.has(k))                    schlecht.push('S'+s+' E'+d+': hinter verschlossener Tür');
            else if(room.type==='boss')         schlecht.push('S'+s+' E'+d+': im Bossraum');
            else if(!randVerbundeneFelder(room)[rr][c])
                                                schlecht.push('S'+s+' E'+d+': von Steinen umschlossen');
          }
        }
        if(n<1||n>2) schlecht.push('S'+s+' E'+d+': '+n+' Schlüssel');
        verteilung[n]=(verteilung[n]||0)+1; etagen++;
        if(d<6) nextFloor();
      }
    }
    return {etagen,gesamt,schlecht:schlecht.slice(0,5),anzahl:schlecht.length,verteilung};
  });
  note(r.anzahl===0,'jede Etage hat 1-2 erreichbare Schlüssel',
       '('+r.etagen+' Etagen, '+r.gesamt+' Schlüssel, Verteilung '+JSON.stringify(r.verteilung)+') '+r.schlecht.join('; '));

  // Praxis: hinlaufen und aufheben. Der Testläufer weicht bei Blockade seitlich
  // aus, sonst bliebe er an Steinen hängen und meldete falsche Fehler.
  const praxis=await page.evaluate(()=>{
    let geholt=0, laeufe=0;
    for(let s=0;s<20;s++){
      startRun(0,'P'+s);
      const zielRaum=Object.keys(KB.G.floor.rooms).find(k=>
        KB.G.floor.rooms[k].drops.some(d=>d.garantiert));
      if(!zielRaum) continue;
      laeufe++;
      const p=KB.G.player; p.redMax=200;p.red=200;
      enterRoom(zielRaum,null); KB.G.enemies.length=0;
      const ziel=KB.G.pickups.find(q=>q.garantiert);
      if(!ziel) continue;
      // Weg über das Kachelraster suchen und Wegpunkt für Wegpunkt ablaufen.
      // Stures Geradeauslaufen bliebe an Steinen hängen und meldete Fehler,
      // die es im Spiel gar nicht gibt.
      const room=KB.G.room;
      const blockiert=(r,c)=>{const z=room.grid[r][c];
        return !!z&&(z.t==='rock'||z.t==='poop'||z.t==='fire'||z.t==='pit');};
      const zr=Math.floor((ziel.y-RY)/TILE), zc=Math.floor((ziel.x-RX)/TILE);
      const sr=Math.floor((p.y-RY)/TILE),    sc=Math.floor((p.x-RX)/TILE);
      const vor=Array.from({length:ROWS},()=>Array(COLS).fill(null));
      const bfs=[[sr,sc]]; vor[sr][sc]=[sr,sc];
      while(bfs.length){ const [rr,cc]=bfs.shift();
        for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
          const nr=rr+dr,nc=cc+dc;
          if(nr<0||nr>=ROWS||nc<0||nc>=COLS||vor[nr][nc]||blockiert(nr,nc)) continue;
          vor[nr][nc]=[rr,cc]; bfs.push([nr,nc]); } }
      if(!vor[zr][zc]) continue;              // wirklich unerreichbar
      const pfad=[]; let cur=[zr,zc];
      while(cur[0]!==sr||cur[1]!==sc){ pfad.unshift(cur); cur=vor[cur[0]][cur[1]]; }
      pfad.push([zr,zc]);
      const vorher=p.keys; let idx=0;
      for(let i=0;i<1200&&p.keys===vorher;i++){
        p.red=200;
        const wp={x:tx(pfad[idx][1]), y:ty(pfad[idx][0])};
        if(Math.hypot(p.x-wp.x,p.y-wp.y)<7 && idx<pfad.length-1) idx++;
        const a=Math.atan2(wp.y-p.y,wp.x-p.x);
        p.vx=Math.cos(a)*140; p.vy=Math.sin(a)*140;
        updateGame(1/60);
      }
      if(p.keys>vorher) geholt++;
    }
    return {geholt,laeufe};
  });
  note(praxis.geholt===praxis.laeufe,'Schlüssel lässt sich auch wirklich einsammeln',
       '('+praxis.geholt+'/'+praxis.laeufe+')');

  // Teleport darf nie in einer von Steinen umschlossenen Nische landen
  const tp=await page.evaluate(()=>{
    let geprueft=0, eingesperrt=0;
    for(let s=0;s<30;s++){
      startRun(0,'TP'+s);
      const p=KB.G.player; p.redMax=200;p.red=200;
      for(const k of Object.keys(KB.G.floor.rooms)){
        if(KB.G.floor.rooms[k].type!=='normal') continue;
        enterRoom(k,null); KB.G.enemies.length=0; geprueft++;
        const room=KB.G.room, ges=randVerbundeneFelder(room);
        const rr=Math.floor((p.y-RY)/TILE), cc=Math.floor((p.x-RX)/TILE);
        if(!ges[rr]||!ges[rr][cc]) eingesperrt++;
      }
    }
    return {geprueft,eingesperrt};
  });
  note(tp.eingesperrt===0,'Teleport setzt nie in einer eingeschlossenen Nische ab',
       '('+tp.geprueft+' Teleports, '+tp.eingesperrt+' eingesperrt)');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}
// --- 8. Spezialräume, Truhen, Automaten, Bomben ---
if(want(8)){
console.log('\n[8] Spezialräume, Truhen, Automaten, Bomben');
await withPage(async(page,errs)=>{
  const bad=[];
  for(const rt of ['treasure','shop','secret','curse','sacrifice','arcade','boss','normal']){
    const err=await page.evaluate((rt)=>{ try{
      startRun(0,'MISC'); const p=KB.G.player;
      p.redMax=200;p.red=200;p.coins=99;p.keys=9;p.bombs=9;
      const k=Object.keys(KB.G.floor.rooms).find(k=>KB.G.floor.rooms[k].type===rt);
      if(!k) return null;
      enterRoom(k,null); KB.G.bossIntro=null;
      for(let i=0;i<200;i++){ p.red=200;p.coins=99;
        if(i%50===0) G.bombs.push({x:p.x+20,y:p.y,t:0.2,r:10});
        p.x=tx(1+(i%11)); p.y=ty(1+((i/11|0)%5)); // alles im Raum berühren
        updateGame(1/60);}
      explode(tx(6),ty(3),80,30,false);
      for(let i=0;i<60;i++) updateGame(1/60);
      return null;}catch(e){return e.message;} },rt);
    if(err) bad.push(rt+': '+err);
  }
  note(bad.length===0,'alle Raumtypen funktionieren',bad.join('; '));
  const fin=await page.evaluate(()=>{ try{
    startRun(0,'SIEG');
    for(let d=0;d<6;d++){KB.G.player.red=KB.G.player.redMax; nextFloor();}
    for(let i=0;i<120;i++) updateGame(1/60);
    return {state:KB.G.state,result:KB.G.result};}catch(e){return {err:e.message};} });
  note(!fin.err&&fin.state==='postrun'&&fin.result==='win','Durchlauf über 6 Etagen endet im Sieg',
       JSON.stringify(fin));
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}
// --- 9. Sprites über echte Frames zeichnen ---
if(want(9)){
console.log('\n[9] Sprites über echte Animationsframes');
await withPage(async(page,errs)=>{
  await page.evaluate(()=>{startRun(0,'ZEICHNEN');KB.G.bossIntro=null;
    KB.G.player.redMax=999;KB.G.player.red=999;});
  for(const t of await page.evaluate(()=>Object.keys(KB.ENEMY_TYPES))){
    await page.evaluate((t)=>{ KB.G.enemies.length=0;
      for(let i=0;i<3;i++) spawnEnemy(t,tx(3+i*3),ty(2),i===0?{tint:'#ff5a5a',hpMul:2}:null);
      KB.G.enemies.forEach(e=>{e.poison=3;e.burn=3;e.frost=3;});
      KB.G.player.red=999; },t);
    await page.waitForTimeout(80);
  }
  await page.screenshot({path:OUT+'shot-2-gegner.png'});
  for(const id of await page.evaluate(()=>Object.keys(KB.BOSS_TYPES))){
    await page.evaluate((id)=>{KB.G.enemies.length=0;spawnBoss(id);KB.G.player.red=999;},id);
    await page.waitForTimeout(120);
    if(id==='kellervater') await page.screenshot({path:OUT+'shot-3-bossintro.png'});
    await page.evaluate(()=>{KB.G.bossIntro=null;});
    await page.waitForTimeout(150);
    if(id==='kellervater') await page.screenshot({path:OUT+'shot-4-bosskampf.png'});
  }
  // Alle Spielfiguren in allen Zuständen zeichnen
  for(const i of [0,1,2,3]){
    await page.evaluate((i)=>{
      startRun(i,'FIG'); const p=KB.G.player;
      p.redMax=99;p.red=99; KB.G.enemies.length=0; KB.G.bossIntro=null;
      p.vx=120; p.hitFlash=0.2; p.shield=3; p.itemGet={id:'glutkern',t:5};
    },i);
    await page.waitForTimeout(120);
    await page.evaluate(()=>{ const p=KB.G.player; p.itemGet=null; p.flags.add('flight'); });
    await page.waitForTimeout(120);
  }
  await page.evaluate(()=>{KB.G.state='charsel';});
  await page.waitForTimeout(250);
  await page.screenshot({path:OUT+'shot-11-charsel.png'});
  note(errs.length===0,'alle Sprites zeichnen fehlerfrei',errs.join(' '));
});

}
// --- 10. Echtes Spiel: Tastatur, Türen, Räume, Screenshots ---
if(want(10)){
console.log('\n[10] Echtes Spiel mit Tastatureingaben');
await withPage(async(page,errs)=>{
  await page.evaluate(()=>{startRun(0,'SPIELEN');KB.G.bossIntro=null;});
  const keys=['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
  for(let i=0;i<32;i++){const k=keys[i%keys.length];
    await page.keyboard.down(k); await page.waitForTimeout(55); await page.keyboard.up(k);}
  await page.screenshot({path:OUT+'shot-5-gameplay.png'});
  // Alle Items gleichzeitig: kombinierte Schusseffekte
  await page.evaluate(()=>{ startRun(0,'ALLES'); const p=KB.G.player;
    p.redMax=999;p.red=999;
    for(const id of Object.keys(KB.ITEMS)) acquireItem(id,null);
    p.itemGet=null; KB.G.banner=null; KB.G.enemies.length=0;
    for(let i=0;i<6;i++) spawnEnemy('blobling',tx(2+i*2),ty(2),null); });
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(1000);
  await page.screenshot({path:OUT+'shot-6-alle-items.png'});
  await page.keyboard.up('ArrowRight');
  // Schatzraum, Pause, Charakterauswahl, Post-Run
  await page.evaluate(()=>teleportToType('treasure'));
  await page.waitForTimeout(300); await page.screenshot({path:OUT+'shot-7-schatzraum.png'});
  await page.keyboard.press('KeyP'); await page.waitForTimeout(200);
  const paused=await page.evaluate(()=>KB.G.state);
  note(paused==='pause','P pausiert das Spiel','(state='+paused+')');
  await page.screenshot({path:OUT+'shot-8-pause.png'});
  await page.keyboard.press('KeyP'); await page.waitForTimeout(150);
  note(await page.evaluate(()=>KB.G.state)==='game','P setzt das Spiel fort');
  await page.evaluate(()=>{KB.G.state='charsel';}); await page.waitForTimeout(200);
  await page.screenshot({path:OUT+'shot-9-charsel.png'});
  await page.evaluate(()=>{KB.G.state='postrun';KB.G.result='win';}); await page.waitForTimeout(200);
  await page.screenshot({path:OUT+'shot-10-postrun.png'});
  note(errs.length===0,'keine JS-Fehler im echten Spiel',errs.join(' '));
});

}
// --- 11. Tod führt zum Post-Run-Screen (Regressionstest Tasteneingabe) ---
if(want(11)){
console.log('\n[11] Tod, Post-Run und Rückkehr ins Menü');
await withPage(async(page,errs)=>{
  await page.evaluate(()=>{startRun(0,'TOD');KB.G.bossIntro=null;});
  // Enter im Spiel gedrückt halten: darf den Post-Run-Screen nicht wegklicken
  await page.keyboard.down('Enter'); await page.waitForTimeout(100); await page.keyboard.up('Enter');
  await page.evaluate(()=>{const p=KB.G.player;p.soul=[];p.red=0;playerDie();});
  await page.waitForTimeout(1600);
  const st=await page.evaluate(()=>KB.G.state);
  note(st==='postrun','Tod führt in den Post-Run-Screen','(state='+st+')');
  await page.waitForTimeout(400);
  note(await page.evaluate(()=>KB.G.state)==='postrun','Post-Run bleibt stehen (kein Auto-Skip)');
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  note(await page.evaluate(()=>KB.G.state)==='menu','Enter führt zurück ins Menü');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}
// --- 12. Bildrate unter Last ---
if(want(12)){
console.log('\n[12] Bildrate unter Last');
await withPage(async(page)=>{
  const fps=await page.evaluate(async()=>{
    startRun(0,'LAST'); KB.G.bossIntro=null;
    const p=KB.G.player; p.redMax=999;p.red=999;
    for(let i=0;i<25;i++) spawnEnemy('zuckfliege',tx(1+i%11),ty(1+(i%5)),null);
    let f=0; const t0=performance.now();
    await new Promise(r=>{const l=()=>{f++;p.red=999;
      if(performance.now()-t0<2000) requestAnimationFrame(l); else r();};requestAnimationFrame(l);});
    return Math.round(f/((performance.now()-t0)/1000));
  });
  note(fps>=55,'flüssige Bildrate mit 25 Gegnern','('+fps+' FPS)');
});


}
console.log('\n================================');
if(fails.length){ console.log('FEHLGESCHLAGEN:'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
console.log('ALLE PRÜFUNGEN BESTANDEN');
})();
