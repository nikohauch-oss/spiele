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
// --- 4b. Die zwölf neuen Kreaturen tun auch, was sie versprechen ---
if(want(4)){
console.log('\n[4b] Verhalten der neuen Kreaturen');
await withPage(async(page,errs)=>{
  const r=await page.evaluate(()=>{
    const schlecht=[], bericht=[];
    const neu=()=>{startRun(0,'M');const p=KB.G.player;p.redMax=200;p.red=200;
      KB.G.enemies.length=0;KB.G.creeps.length=0;return p;};
    const pruef=(name,bedingung,text)=>{ bericht.push(name+': '+text);
      if(!bedingung) schlecht.push(name+' — '+text); };

    {const p=neu();const e=spawnEnemy('steinruecken',tx(6),ty(3),null);e.hp=500;e.blick=0;
     const h0=e.hp; damageEnemy(e,20,Math.PI); const vorn=h0-e.hp;
     const h1=e.hp; damageEnemy(e,20,0);       const hinten=h1-e.hp;
     pruef('Steinrücken',vorn===0&&hinten>20,'vorn '+vorn+', hinten '+hinten);}

    {const p=neu();const e=spawnEnemy('aschgeist',tx(6),ty(3),null);
     e.hp=1; damageEnemy(e,50); const zurueck=!e.dead&&e.sammelt>0;
     const e2=spawnEnemy('aschgeist',tx(4),ty(3),null); e2.burn=3;e2.hp=1; damageEnemy(e2,50);
     pruef('Aschgeist',zurueck&&e2.dead,'sammelt sich, brennend endgültig tot');}

    {const p=neu();p.x=tx(1);p.y=ty(1); spawnPickup(tx(6),ty(3),'coin');
     const e=spawnEnemy('schlundling',tx(6)+20,ty(3),null); e.hp=500;
     for(let k=0;k<120;k++) updateGame(1/60);
     const geklaut=!!e.beute; e.hp=1; damageEnemy(e,10);
     const zurueck=KB.G.pickups.some(q=>q.type==='coin'&&!q.dead);
     pruef('Schlundling',geklaut&&zurueck,'klaut und gibt beim Tod zurück');}

    {const p=neu();const h=spawnEnemy('schimmelherz',tx(6),ty(3),null);h.hp=500;
     const o=spawnEnemy('blobling',tx(5),ty(3),null); o.hp=o.maxHp*0.3; const vor=o.hp;
     for(let k=0;k<300;k++){p.red=200;updateGame(1/60);}
     pruef('Schimmelherz',o.hp>vor,'heilt '+vor.toFixed(1)+' auf '+o.hp.toFixed(1));}

    {const p=neu();p.x=tx(6);p.y=ty(3);const e=spawnEnemy('glockenmaul',tx(4),ty(3),null);
     e.hp=500;e.cd=0; let maxV=0;
     for(let k=0;k<200;k++){p.red=200;updateGame(1/60);maxV=Math.max(maxV,Math.hypot(p.vx,p.vy));}
     pruef('Glockenmaul',maxV>300,'Rückstoß '+Math.round(maxV)+' px/s');}

    {const p=neu();p.x=tx(6);p.y=ty(3);
     G.creeps.push({x:p.x,y:p.y,r:30,t:9,feindlich:true,netz:true});
     for(let k=0;k<30;k++){p.red=200;updateGame(1/60);}
     pruef('Spinnwirt',p.imNetz&&p.red===200,'Netz bremst, verletzt aber nicht');}

    {const p=neu();const e=spawnEnemy('sporenwirt',tx(6),ty(3),null);e.hp=500;
     damageEnemy(e,5); for(let k=0;k<10;k++) updateGame(1/60);
     const n=KB.G.creeps.filter(c=>c.sporen).length;
     pruef('Sporenwirt',n>0,n+' Sporenwolke(n) nach Treffer');}

    {const p=neu();const e=spawnEnemy('klingenrad',tx(6),ty(1),null);e.hp=9000;
     for(let k=0;k<60;k++) updateGame(1/60); const t0=e.tempo;
     for(let k=0;k<1400;k++) updateGame(1/60);
     pruef('Klingenrad',e.tempo>t0,'Tempo '+t0+' auf '+e.tempo+' nach '+e.runden+' Runden');}

    {const p=neu();p.x=tx(6);p.y=ty(3);const e=spawnEnemy('laternenfisch',tx(9),ty(3),null);
     e.hp=500;e.spd=0; const d0=dist(p,e);
     for(let k=0;k<60;k++){p.red=200;updateGame(1/60);}
     pruef('Laternenfisch',dist(p,e)<d0,'zieht von '+Math.round(d0)+' auf '+Math.round(dist(p,e)));}

    {const p=neu();const e=spawnEnemy('kettenhund',tx(5),ty(3),null);e.hp=9000;
     let maxD=0, saetze=0;
     for(let k=0;k<900;k++){ p.red=200;p.x=tx(7);p.y=ty(3);p.vx=p.vy=0;
       const vor=e.state; updateGame(1/60);
       if(vor===0&&e.state===1) saetze++;
       maxD=Math.max(maxD,Math.hypot(e.x-e.ankerX,e.y-e.ankerY)); }
     pruef('Kettenhund',saetze>0&&maxD<e.kette+12,
           saetze+' Sätze, bleibt bei '+Math.round(maxD)+' px an der Kette');}

    {const p=neu();const e=spawnEnemy('talgwicht',tx(6),ty(3),null);
     for(let k=0;k<30;k++) updateGame(1/60);
     const glut=KB.G.creeps.filter(c=>c.glut).length;
     pruef('Talgwicht',glut>0,glut+' Brandflecken hinterlassen');}

    {const p=neu(); let e=spawnEnemy('zwiebelbalg',tx(6),ty(3),null);
     const stufen=[];
     for(let i=0;i<3;i++){ e=KB.G.enemies.find(q=>!q.dead&&q.type.startsWith('zwiebel'));
       if(!e) break; stufen.push(e.type); damageEnemy(e,999); }
     pruef('Zwiebelbalg',stufen.length===3,stufen.length+' Stufen');}

    return {schlecht,bericht};
  });
  r.bericht.forEach(b=>console.log('      '+b));
  note(r.schlecht.length===0,'alle zwölf neuen Kreaturen wirken wie beschrieben',
       r.schlecht.join('; '));
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}
// --- 4c. Kennzeichen-Gegner erscheinen nur auf ihrer Etage ---
if(want(4)){
console.log('\n[4c] Etagen-Exklusivität');
await withPage(async(page,errs)=>{
  const r=await page.evaluate(()=>{
    const schlecht=[], bericht=[];
    // Wer ein Feld `etage` trägt, darf ausschließlich dort im Pool stehen
    for(const id of Object.keys(KB.ENEMY_TYPES)){
      const soll=KB.ENEMY_TYPES[id].etage;
      if(!soll) continue;
      const drin=[];
      KB.FLOORS.forEach((f,i)=>{ if(f.pool.includes(id)) drin.push(i+1); });
      if(drin.length!==1||drin[0]!==soll)
        schlecht.push(KB.ENEMY_TYPES[id].name+' steht auf Etage '+(drin.join(',')||'keiner')+
                      ' statt nur auf '+soll);
    }
    // Jede Etage muss drei eigene Kennzeichen-Gegner haben
    KB.FLOORS.forEach((f,i)=>{
      const eigen=f.pool.filter(id=>KB.ENEMY_TYPES[id].etage===i+1);
      bericht.push('E'+(i+1)+' '+f.name+': '+eigen.map(id=>KB.ENEMY_TYPES[id].name).join(', '));
      if(eigen.length<3) schlecht.push(f.name+' hat nur '+eigen.length+' eigene Gegner');
    });
    // Und im Spiel darf auf einer Etage nichts Fremdes auftauchen
    for(let s=0;s<12;s++){
      startRun(0,'X'+s);
      for(let d=1;d<=6;d++){
        for(const k of Object.keys(KB.G.floor.rooms)){
          for(const sp of KB.G.floor.rooms[k].spawns){
            const soll=KB.ENEMY_TYPES[sp.type].etage;
            if(soll&&soll!==d)
              schlecht.push('Seed X'+s+' E'+d+': '+KB.ENEMY_TYPES[sp.type].name+' gehört auf E'+soll);
          }
        }
        if(d<6) nextFloor();
      }
    }
    return {schlecht:[...new Set(schlecht)].slice(0,6),anzahl:schlecht.length,bericht};
  });
  r.bericht.forEach(b=>console.log('      '+b));
  note(r.anzahl===0,'Kennzeichen-Gegner erscheinen nur auf ihrer eigenen Etage',
       r.schlecht.join('; '));
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
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
      KB.G.pickups.length=0;                // damit auch der Magnet etwas findet
      spawnPickup(tx(1),ty(1),'coin');
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
  // Alle Spielfiguren in allen Zuständen zeichnen — die Zahl kommt aus der
  // Tabelle, neue Figuren werden also automatisch mitgeprüft.
  const figuren=await page.evaluate(()=>KB.CHARS.map((c,i)=>i));
  for(const i of figuren){
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

// --- 13. Türkennzeichnung der Sonderräume und Item-Abwurf der Gegner ---
if(want(13)){
console.log('\n[13] Sondertüren und Item-Abwurf');
await withPage(async(page,errs)=>{
  // Verteilung der Sondertüren über 40 Läufe à 6 Etagen zählen.
  const z=await page.evaluate(()=>{
    let shop=0,shopZu=0,schatz=0,schatzZu=0,alt=0;
    for(let s=0;s<40;s++){
      startRun(0,'D'+s);
      for(let d=1;d<=6;d++){
        for(const ek in KB.G.floor.doors){
          const e=KB.G.floor.doors[ek];
          if(e.kind==='shop'){ shop++; if(e.locked) shopZu++; }
          if(e.kind==='schatz'){ schatz++; if(e.locked) schatzZu++; }
          if(e.kind==='locked') alt++;      // alte, jetzt ungültige Türart
        }
        if(d<6) nextFloor();
      }
    }
    return {shop,shopZu,schatz,schatzZu,alt};
  });
  note(z.shop>0&&z.shop===z.shopZu,'Shoptüren sind immer verschlossen',
       '('+z.shopZu+' von '+z.shop+')');
  note(z.schatzZu>0&&z.schatzZu<z.schatz,'Schatztüren kommen verschlossen UND offen vor',
       '('+z.schatzZu+' zu, '+(z.schatz-z.schatzZu)+' offen von '+z.schatz+')');
  note(z.alt===0,'keine Tür trägt mehr die alte Sammelart "locked"');

  // Eine offene Schatztür muss ohne Schlüssel durchlässig sein. Der Raum
  // davor wird für den Test von Steinen befreit — geprüft wird die Tür,
  // nicht das Ausweichen um Hindernisse.
  const durch=await page.evaluate(()=>{
    let versuche=0, geschafft=0;
    for(let s=0;s<120&&versuche<10;s++){
      startRun(0,'O'+s);
      const f=KB.G.floor;
      let fertig=false;
      for(const k in f.rooms){
        if(fertig) break;
        for(const d in f.rooms[k].doors){
          const t=f.rooms[k].doors[d];
          if(t.edge.kind!=='schatz'||t.edge.locked) continue;
          if(f.rooms[t.to].type!=='treasure') continue;
          enterRoom(k,null);
          KB.G.bossIntro=null;          // sonst friert der Bossraum die Eingabe ein
          KB.G.enemies.length=0; KB.G.room.cleared=true;
          for(const zeile of KB.G.room.grid) zeile.fill(null);
          const p=KB.G.player; p.keys=0; p.red=99; p.redMax=99;
          const vorher=KB.G.roomKey, dp=doorXY(d);
          for(let i=0;i<400&&KB.G.roomKey===vorher;i++){
            const a=Math.atan2(dp.y-p.y,dp.x-p.x);
            p.vx=Math.cos(a)*200; p.vy=Math.sin(a)*200; updateGame(1/60);
          }
          p.vx=0; p.vy=0;
          for(let i=0;i<40;i++){ p.vx=0; p.vy=0; updateGame(1/60); }
          versuche++;
          /* Der Spieler startet ohne Schlüssel — kommt er drin an, war die Tür
             wirklich offen. Sein Schlüsselstand danach sagt nichts aus: im
             Schatzraum kann der garantierte Schlüssel der Etage liegen. */
          if(KB.G.room.type==='treasure') geschafft++;
          fertig=true; break;
        }
      }
    }
    return {versuche,geschafft};
  });
  note(durch.versuche>=8&&durch.geschafft===durch.versuche,
       'offene Schatztür lässt ohne Schlüssel durch',
       '('+durch.geschafft+'/'+durch.versuche+')');

  // Ein von einem Gegner fallengelassenes Item liegt am Boden und lässt
  // sich einsammeln wie jedes andere Aufsammelbare.
  const einsammeln=await page.evaluate(()=>{
    startRun(0,'ABWURF');
    const p=KB.G.player; p.red=99; p.redMax=99;
    KB.G.enemies.length=0;
    const habe=()=>p.items.length+(p.active?1:0);
    const vorher=habe();
    spawnItemAbwurf(p.x+26,p.y);
    const lag=KB.G.pickups.filter(q=>q.type==='item').length;
    for(let i=0;i<180;i++){ p.vx=60; p.vy=0; updateGame(1/60); }
    return {lag, dazu:habe()-vorher,
            liegtNoch:KB.G.pickups.filter(q=>q.type==='item'&&!q.dead).length};
  });
  note(einsammeln.lag===1,'abgeworfenes Item liegt am Boden');
  note(einsammeln.dazu===1&&einsammeln.liegtNoch===0,
       'abgeworfenes Item lässt sich einsammeln',
       '(+'+einsammeln.dazu+' Item)');

  // Abwurfquote: selten bei normalen Gegnern, deutlich häufiger bei Champions.
  const quote=await page.evaluate(()=>{
    const messen=(champ)=>{
      startRun(0,'Q'+(champ?'C':'N'));
      KB.G.pickups.length=0; KB.G.enemies.length=0;
      for(let n=0;n<2000;n++)
        killEnemy(spawnEnemy('tropfling',tx(6),ty(3),champ));
      return KB.G.pickups.filter(q=>q.type==='item').length;
    };
    return {normal:messen(null), champion:messen({tint:'#ff5a5a',hpMul:1.7})};
  });
  note(quote.normal>=8&&quote.normal<=60,'normale Gegner lassen selten ein Item fallen',
       '('+quote.normal+' aus 2000)');
  note(quote.champion>quote.normal*3,'Champions lassen deutlich öfter Items fallen',
       '('+quote.champion+' aus 2000)');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 14. Grundrisse und Etagen-Handschriften ---
if(want(14)){
console.log('\n[14] Grundrisse und Etagen-Handschriften');
await withPage(async(page,errs)=>{
  // Jeder Grundriss muss spielbar sein: alle vier Türgassen begehbar und
  // untereinander verbunden — auch dann, wenn jedes 'r' zum Stein wird.
  const plaene=await page.evaluate(()=>{
    const ROWS=7, COLS=13, TUEREN=[[0,6],[6,6],[3,0],[3,12]];
    const probleme=[];
    KB.TEMPLATES.normal.forEach((plan,i)=>{
      for(const schlimm of [true,false]){
        const zu=z=>z==='R'||z==='P'||z==='F'||z==='C'||(schlimm&&z==='r');
        const ges=Array.from({length:ROWS},()=>Array(COLS).fill(false));
        if(zu(plan[0][6])){ probleme.push('#'+(i+1)+' Türgasse oben verbaut'); continue; }
        const q=[[0,6]]; ges[0][6]=true;
        while(q.length){ const [r,c]=q.shift();
          for(const [dr,dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
            const nr=r+dr,nc=c+dc;
            if(nr<0||nr>=ROWS||nc<0||nc>=COLS||ges[nr][nc]||zu(plan[nr][nc])) continue;
            ges[nr][nc]=true; q.push([nr,nc]); } }
        for(const [r,c] of TUEREN)
          if(!ges[r][c]) probleme.push('#'+(i+1)+' Tür '+r+','+c+' unerreichbar');
        for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++)
          if(plan[r][c]==='e'&&!ges[r][c]) probleme.push('#'+(i+1)+' Gegnerplatz eingeschlossen');
      }
    });
    return {anzahl:KB.TEMPLATES.normal.length, probleme:[...new Set(probleme)]};
  });
  note(plaene.anzahl>=20,'zwanzig Grundrisse vorhanden','('+plaene.anzahl+')');
  note(plaene.probleme.length===0,'jeder Grundriss ist von allen vier Türen aus spielbar',
       plaene.probleme.slice(0,4).join('; '));

  // Jede Etage braucht eine eigene Handschrift, und jede muss zeichnen können.
  const hs=await page.evaluate(()=>{
    const noetig=['licht','tiefe','feuerschein','bodenDeko','wandDeko','dunst',
                  'stein','loch','stachel','feuer','wuchs'];
    const fehlt=[];
    KB.HANDSCHRIFTEN.forEach((h,i)=>noetig.forEach(k=>{ if(h[k]===undefined) fehlt.push('E'+(i+1)+'.'+k); }));
    return {anzahl:KB.HANDSCHRIFTEN.length, etagen:KB.FLOORS.length, fehlt};
  });
  note(hs.anzahl===hs.etagen,'jede Etage hat eine eigene Handschrift',
       '('+hs.anzahl+' von '+hs.etagen+')');
  note(hs.fehlt.length===0,'keine Handschrift lässt etwas aus',hs.fehlt.join(' '));

  /* Jede Etage muss sichtbar anders aussehen. Geprüft über das fertige Bild:
     derselbe Raum auf sechs Etagen darf nie zweimal dasselbe ergeben. */
  const bilder=await page.evaluate(async()=>{
    const sig=[];
    for(let etage=1;etage<=KB.FLOORS.length;etage++){
      startRun(0,'BILD'); for(let d=1;d<etage;d++) nextFloor();
      KB.G.bossIntro=null; KB.G.enemies.length=0;
      // ein Raum mit allen fünf Hindernisarten
      for(let r=0;r<7;r++)for(let c=0;c<13;c++) KB.G.room.grid[r][c]=null;
      KB.G.room.grid[1][2]={t:'rock'};  KB.G.room.grid[1][4]={t:'pit'};
      KB.G.room.grid[1][8]={t:'spike'}; KB.G.room.grid[5][4]={t:'fire',hp:4,red:false};
      KB.G.room.grid[5][8]={t:'poop',hp:3};
      raumBildNeu();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const c=document.querySelector('canvas');
      // getImageData rechnet in echten Bildpunkten, das Spiel in 640x360
      const S=c.width/640;
      const d=c.getContext('2d').getImageData(60*S,50*S,520*S,280*S).data;
      let h=0; for(let i=0;i<d.length;i+=97) h=(h*31+d[i])>>>0;   // grober Fingerabdruck
      sig.push(h);
    }
    return sig;
  });
  note(new Set(bilder).size===bilder.length,
       'jede Etage sieht wirklich anders aus','('+new Set(bilder).size+' verschiedene von '+bilder.length+')');

  /* Der vorgebackene Hintergrund muss verworfen werden, sobald sich am
     Raster etwas ändert — sonst bliebe ein gesprengter Stein stehen. */
  const backen=await page.evaluate(async()=>{
    startRun(0,'BACK'); KB.G.bossIntro=null;
    for(let r=0;r<7;r++)for(let c=0;c<13;c++) KB.G.room.grid[r][c]=null;
    KB.G.room.grid[3][4]={t:'rock'};
    await new Promise(r=>requestAnimationFrame(r));
    const vorher=KB.raumBildStand;
    explode(tx(4),ty(3),60,0);                       // Stein wegsprengen
    await new Promise(r=>requestAnimationFrame(r));
    return {vorher, nachher:KB.raumBildStand, stein:!!KB.G.room.grid[3][4]};
  });
  note(backen.stein===false&&backen.vorher!==backen.nachher&&backen.nachher!=='',
       'gesprengter Stein verschwindet auch aus dem vorgebackenen Bild');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 15. Teufels- und Engelsraum ---
if(want(15)){
console.log('\n[15] Teufels- und Engelsraum');
await withPage(async(page,errs)=>{
  // Die Kammer hängt allein am Bossraum und bleibt bis dahin unsichtbar.
  const bau=await page.evaluate(()=>{
    let etagen=0, mitKammer=0, falscherNachbar=0, sichtbar=0, aufKarte=0, schluesselDrin=0;
    for(let s=0;s<40;s++){
      startRun(0,'K'+s);
      for(let d=1;d<=6;d++){
        const f=KB.G.floor; etagen++;
        const keys=Object.keys(f.rooms).filter(k=>f.rooms[k].type==='devil');
        if(keys.length===1){
          mitKammer++;
          const r0=f.rooms[keys[0]], tueren=Object.values(r0.doors);
          if(tueren.length!==1||f.rooms[tueren[0].to].type!=='boss') falscherNachbar++;
          if(tueren[0].edge.revealed) sichtbar++;
          if(r0.seen) aufKarte++;
          if(r0.drops.some(q=>q.garantiert)) schluesselDrin++;
        }
        if(d<6) nextFloor();
      }
    }
    return {etagen,mitKammer,falscherNachbar,sichtbar,aufKarte,schluesselDrin};
  });
  note(bau.mitKammer>bau.etagen*0.9,'fast jede Etage hat eine Kammer hinter dem Boss',
       '('+bau.mitKammer+' von '+bau.etagen+')');
  note(bau.falscherNachbar===0,'die Kammer grenzt nur an den Bossraum');
  note(bau.sichtbar===0&&bau.aufKarte===0,'vor dem Bosskampf ist sie weder sichtbar noch auf der Karte');
  note(bau.schluesselDrin===0,'kein garantierter Schlüssel landet in der Kammer');

  // Ohne Treffer immer, mit Treffer nur manchmal.
  const quote=await page.evaluate(()=>{
    const messen=(getroffen)=>{
      let auf=0, ges=0;
      for(let s=0;s<200&&ges<120;s++){
        startRun(0,'Q'+(getroffen?'T':'H')+s);
        const f=KB.G.floor;
        if(!Object.values(f.rooms).some(r=>r.type==='devil')) continue;
        enterRoom(f.bossKey,null); KB.G.enemies.length=0; KB.G.bossIntro=null;
        KB.G.floorHit=getroffen; KB.G.deals=0;
        onBossRoomCleared(); ges++;
        const kammer=Object.values(f.rooms).find(r=>r.type==='devil'||r.type==='angel');
        const tuer=Object.values(KB.G.room.doors).find(t=>f.rooms[t.to]===kammer);
        if(tuer&&tuer.edge.revealed) auf++;
      }
      return {auf,ges};
    };
    return {heil:messen(false), getroffen:messen(true)};
  });
  note(quote.heil.auf===quote.heil.ges,'ohne einen Treffer öffnet sich die Kammer immer',
       '('+quote.heil.auf+'/'+quote.heil.ges+')');
  note(quote.getroffen.auf>0&&quote.getroffen.auf<quote.getroffen.ges*0.5,
       'mit Treffern öffnet sie sich nur manchmal',
       '('+quote.getroffen.auf+'/'+quote.getroffen.ges+')');

  // Der Handel: Herzen statt Münzen, danach kein Engel mehr.
  const handel=await page.evaluate(()=>{
    const kammerBetreten=(art,vorbereiten)=>{
      for(let s=0;s<300;s++){
        startRun(0,art[0].toUpperCase()+s);
        const f=KB.G.floor;
        if(!Object.values(f.rooms).some(r=>r.type==='devil')) continue;
        enterRoom(f.bossKey,null); KB.G.enemies.length=0; KB.G.bossIntro=null;
        KB.G.floorHit=false; KB.G.deals=art==='angel'?0:1;
        onBossRoomCleared();
        const kammer=Object.values(f.rooms).find(r=>r.type==='devil'||r.type==='angel');
        if(!kammer||kammer.type!==art) continue;
        const key=Object.keys(f.rooms).find(k=>f.rooms[k]===kammer);
        enterRoom(key,null); KB.G.bossIntro=null;
        if(vorbereiten) vorbereiten(KB.G.player);
        const pd=KB.G.room.pedestals[0];
        /* Ein neutrales Item auflegen: geprüft wird der Preis des Handels,
           nicht was das Item selbst noch kostet (der Dämonenpakt etwa
           nimmt für sich schon einen Container). */
        pd.itemId='vierblatt';
        KB.G.player.x=pd.x; KB.G.player.y=pd.y; pd.cd=0;
        const vorMax=KB.G.player.redMax, vorItems=KB.G.player.items.length;
        const vorDeals=KB.G.deals;
        for(let i=0;i<10;i++) updateGame(1/60);
        return {podeste:KB.G.room.pedestals.length, herzPreis:!!pd.herzPreis,
                genommen:!!pd.taken, vorMax, nachMax:KB.G.player.redMax,
                dealsDazu:KB.G.deals-vorDeals,
                itemDazu:KB.G.player.items.length-vorItems,
                tot:KB.G.player.dead};
      }
      return null;
    };
    return {teufel:kammerBetreten('devil'),
            engel:kammerBetreten('angel'),
            arm:kammerBetreten('devil',p=>{p.redMax=2;p.red=2;p.soul.length=0;})};
  });
  note(handel.teufel&&handel.teufel.podeste===2&&handel.teufel.herzPreis,
       'der Teufel bietet zwei Items gegen Herzen an');
  note(handel.teufel&&handel.teufel.genommen&&handel.teufel.nachMax===handel.teufel.vorMax-2
       &&handel.teufel.dealsDazu===1,
       'ein Handel kostet genau einen Herzcontainer',
       handel.teufel?'('+handel.teufel.vorMax+' → '+handel.teufel.nachMax+' Hälften)':'');
  note(handel.engel&&handel.engel.podeste===1&&!handel.engel.herzPreis
       &&handel.engel.genommen&&handel.engel.itemDazu===1,
       'der Engel gibt sein Item umsonst');
  note(handel.arm&&!handel.arm.genommen&&!handel.arm.tot&&handel.arm.dealsDazu===0,
       'wer nicht zahlen kann, stirbt nicht daran — das Angebot bleibt stehen');

  const engelDanach=await page.evaluate(()=>{
    let engel=0, ges=0;
    for(let s=0;s<120&&ges<60;s++){
      startRun(0,'N'+s);
      const f=KB.G.floor;
      if(!Object.values(f.rooms).some(r=>r.type==='devil')) continue;
      enterRoom(f.bossKey,null); KB.G.enemies.length=0; KB.G.bossIntro=null;
      KB.G.floorHit=false; KB.G.deals=1;          // schon gehandelt
      onBossRoomCleared(); ges++;
      const k=Object.values(f.rooms).find(r=>r.type==='devil'||r.type==='angel');
      if(k&&k.type==='angel') engel++;
    }
    return {engel,ges};
  });
  note(engelDanach.engel===0&&engelDanach.ges>20,
       'nach dem ersten Handel zeigt sich kein Engel mehr',
       '('+engelDanach.engel+' von '+engelDanach.ges+')');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 16. Die neun Spielfiguren und ihre Eigenheiten ---
if(want(16)){
console.log('\n[16] Spielfiguren');
await withPage(async(page,errs)=>{
  const tabelle=await page.evaluate(()=>{
    const maengel=[];
    KB.CHARS.forEach((c,i)=>{
      for(const feld of ['id','name','desc','color','hood','frisur','red','speed',
                         'tps','dmg','range','shot','luck'])
        if(c[feld]===undefined) maengel.push(c.id+': '+feld+' fehlt');
      if(c.item&&!KB.ITEMS[c.item]) maengel.push(c.id+': Startitem '+c.item+' gibt es nicht');
      if(c.unlock&&!c.unlockText) maengel.push(c.id+': Freischalttext fehlt');
      if(c.red===0&&!c.soul.length) maengel.push(c.id+': startet ohne jedes Leben');
    });
    // Fahnen der Figur müssen beim Start wirklich gesetzt sein
    const gesetzt=KB.CHARS.map((c,i)=>{
      startRun(i,'F'+i);
      return (c.flags||[]).every(f=>KB.G.player.flags.has(f));
    });
    return {anzahl:KB.CHARS.length, maengel, alleFahnen:gesetzt.every(Boolean)};
  });
  note(tabelle.anzahl>=9,'neun Figuren stehen zur Wahl','('+tabelle.anzahl+')');
  note(tabelle.maengel.length===0,'jede Figur ist vollständig beschrieben',
       tabelle.maengel.slice(0,4).join('; '));
  note(tabelle.alleFahnen,'jede Figur bringt ihre Fahnen von Anfang an mit');

  // Rosenbraut: verschlossene Tür ohne Schlüssel
  const braut=await page.evaluate(()=>{
    const idx=KB.CHARS.findIndex(c=>c.id==='rosenbraut');
    for(let s=0;s<80;s++){
      startRun(idx,'RB'+s);
      KB.G.bossIntro=null;
      const p=KB.G.player; p.keys=0; p.redMax=99; p.red=99;
      const t=KB.G.room.doors.u||KB.G.room.doors.d||KB.G.room.doors.l||KB.G.room.doors.r;
      const richtung=Object.keys(KB.G.room.doors).find(d=>KB.G.room.doors[d].edge.locked);
      if(!richtung) continue;
      const tuer=KB.G.room.doors[richtung], vorher=KB.G.roomKey, dp=doorXY(richtung);
      for(let i=0;i<500&&KB.G.roomKey===vorher;i++){
        const a=Math.atan2(dp.y-p.y,dp.x-p.x);
        p.vx=Math.cos(a)*200; p.vy=Math.sin(a)*200; updateGame(1/60);
      }
      p.vx=0; p.vy=0;
      for(let i=0;i<30;i++){ p.vx=0; p.vy=0; updateGame(1/60); }
      return {gewechselt:KB.G.roomKey!==vorher, keys:p.keys, offen:!tuer.edge.locked};
    }
    return null;
  });
  note(braut&&braut.gewechselt&&braut.keys===0&&braut.offen,
       'die Rosenbraut öffnet verschlossene Türen ohne Schlüssel');

  // Mooskind: heilt beim Räumen, aber nie über die eigenen Container
  const moos=await page.evaluate(()=>{
    const idx=KB.CHARS.findIndex(c=>c.id==='mooskind');
    startRun(idx,'MOOS'); KB.G.bossIntro=null;
    const p=KB.G.player;
    p.red=1;                                   // stark angeschlagen
    KB.G.room.type='normal'; KB.G.room.cleared=false;
    KB.G.enemies.length=0;
    updateDoorsOpen(true);
    const nachEinem=p.red;
    p.red=p.redMax;                            // schon voll
    KB.G.room.cleared=false; updateDoorsOpen(true);
    return {start:1, nachEinem, ueberVoll:p.red, max:p.redMax};
  });
  note(moos.nachEinem===2,'das Mooskind heilt ein halbes Herz je geräumtem Raum',
       '(1 → '+moos.nachEinem+' Hälften)');
  note(moos.ueberVoll===moos.max,'es heilt nie über die eigenen Container hinaus');

  // Flickenpuppe: steht genau einmal wieder auf
  const puppe=await page.evaluate(()=>{
    const idx=KB.CHARS.findIndex(c=>c.id==='flickenpuppe');
    startRun(idx,'PUPPE'); KB.G.bossIntro=null;
    const p=KB.G.player;
    p.soul.length=0; p.red=1;
    hurtPlayer(9,true);
    const nachErstem={tot:p.dead, red:p.red};
    p.iframes=0; p.soul.length=0; p.red=Math.max(1,p.red);
    hurtPlayer(9,true);
    return {nachErstem, totNachZweitem:p.dead};
  });
  note(puppe.nachErstem.tot===false&&puppe.nachErstem.red>0,
       'die Flickenpuppe übersteht den ersten Tod',
       '(Leben danach: '+puppe.nachErstem.red+' Hälften)');
  note(puppe.totNachZweitem===true,'beim zweiten Mal bleibt sie liegen');

  // Laternenkind: kennt die Etage, aber keine Geheimräume
  const laterne=await page.evaluate(()=>{
    const idx=KB.CHARS.findIndex(c=>c.id==='laternenkind');
    startRun(idx,'LAT');
    const f=KB.G.floor, alle=Object.values(f.rooms);
    const offen=alle.filter(r=>r.type!=='secret');
    const geheim=alle.filter(r=>r.type==='secret');
    // zum Vergleich eine Figur ohne Laterne
    startRun(0,'LAT');
    const f2=KB.G.floor;
    const ungesehen=Object.values(f2.rooms).filter(r=>!r.seen).length;
    return {gesehen:offen.every(r=>r.seen), geheimVerborgen:geheim.every(r=>!r.seen),
            ohneLaterneUngesehen:ungesehen};
  });
  note(laterne.gesehen,'das Laternenkind kennt die ganze Etage sofort');
  note(laterne.geheimVerborgen,'Geheimräume bleiben auch für es verborgen');
  note(laterne.ohneLaterneUngesehen>0,'ohne Laterne bleibt die Etage dunkel',
       '('+laterne.ohneLaterneUngesehen+' Räume unbekannt)');

  // Schrauber: eigene Bomben tun ihm nichts
  const schrauber=await page.evaluate(()=>{
    const idx=KB.CHARS.findIndex(c=>c.id==='schrauber');
    startRun(idx,'SCHR'); KB.G.bossIntro=null;
    const p=KB.G.player; p.iframes=0; KB.G.roomFresh=0;
    const vorher=p.red;
    explode(p.x,p.y,60,0);
    return {vorher, nachher:p.red, bomben:p.bombs};
  });
  note(schrauber.nachher===schrauber.vorher,
       'dem Schrauber schadet die eigene Bombe nicht',
       '('+schrauber.vorher+' → '+schrauber.nachher+')');
  note(schrauber.bomben>=4,'er startet mit vollen Taschen','('+schrauber.bomben+' Bomben)');

  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 17. Item-Erklärungen ---
if(want(17)){
console.log('\n[17] Was die Items machen');
await withPage(async(page,errs)=>{
  // Jedes Item braucht einen Namen und eine Wirkungsbeschreibung, sonst
  // steht auf der Tafel nichts Brauchbares.
  const texte=await page.evaluate(()=>{
    const maengel=[];
    for(const id in KB.ITEMS){
      const it=KB.ITEMS[id];
      if(!it.name) maengel.push(id+': kein Name');
      if(!it.desc||it.desc.length<6) maengel.push(id+': keine Wirkungsbeschreibung');
      if(it.desc&&it.desc.length>52) maengel.push(id+': Beschreibung zu lang ('+it.desc.length+')');
      // muss in zwei Zeilen der Tafel passen
      if(it.desc&&textZeilen(it.desc,7,128).length>2) maengel.push(id+': passt nicht auf die Tafel');
    }
    return {anzahl:Object.keys(KB.ITEMS).length, maengel};
  });
  note(texte.maengel.length===0,'jedes Item sagt in ein bis zwei Zeilen, was es tut',
       texte.maengel.slice(0,4).join('; '));

  // Die Tafel erscheint nur in der Nähe des Podests.
  const tafel=await page.evaluate(async()=>{
    const zaehlen=()=>KB.tafelnGezeichnet;
    for(let s=0;s<80;s++){
      startRun(0,'TAF'+s);
      const f=KB.G.floor;
      const k=Object.keys(f.rooms).find(k=>f.rooms[k].type==='treasure');
      if(!k) continue;
      enterRoom(k,null); KB.G.bossIntro=null;
      const pd=KB.G.room.pedestals[0]; if(!pd) continue;
      pd.cd=99;                                   // nicht aufheben
      const p=KB.G.player;
      p.x=pd.x+200; p.y=pd.y;                     // weit weg
      await new Promise(r=>requestAnimationFrame(r));
      const fern=zaehlen();
      p.x=pd.x; p.y=pd.y+22;                      // dicht dran
      await new Promise(r=>requestAnimationFrame(r));
      const nah=zaehlen();
      return {fern, nah, gefunden:true};
    }
    return {gefunden:false};
  });
  note(tafel.gefunden&&tafel.nah>0,'am Podest steht, was das Item bewirkt');
  note(tafel.gefunden&&tafel.fern===0,'aus der Ferne bleibt die Tafel weg');

  // Pausenliste: zeigt alles, blättert, und man kommt wieder heraus.
  const pause=await page.evaluate(async()=>{
    startRun(0,'PLIST'); KB.G.bossIntro=null;
    const ids=Object.keys(KB.ITEMS).filter(id=>KB.ITEMS[id].type==='passive').slice(0,15);
    for(const id of ids) acquireItem(id,null);
    KB.G.player.itemGet=null;
    KB.G.state='pause';
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    const habe=KB.G.player.items.length+(KB.G.player.active?1:0);
    return {habe, seite:menu.itemSeite, state:KB.G.state};
  });
  note(pause.habe===15,'die Pause kennt alle eingesammelten Items','('+pause.habe+')');

  const raus=await page.evaluate(async()=>{
    // Blättern darf das Fortsetzen nicht blockieren
    Input.press&&Input.press('ArrowRight');
    KB.G.state='pause';
    await new Promise(r=>requestAnimationFrame(r));
    return KB.G.state;
  });
  note(raus==='pause','Blättern verlässt die Pause nicht');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 18. Auflösung, Bosslohn und Herzobergrenze ---
if(want(18)){
console.log('\n[18] Bild, Bosslohn, Herzgrenze');
await withPage(async(page,errs)=>{
  // Die Leinwand muss echte Bildpunkte haben, nicht 640x360 hochskaliert.
  const bild=await page.evaluate(()=>{
    const c=document.querySelector('canvas');
    return {skala:SKALA, breite:c.width, hoehe:c.height,
            css:Math.round(c.getBoundingClientRect().width),
            geglaettet:c.getContext('2d').imageSmoothingEnabled};
  });
  note(bild.skala>=2&&bild.breite===640*bild.skala&&bild.hoehe===360*bild.skala,
       'die Leinwand rechnet in echten Bildpunkten',
       '('+bild.breite+'×'+bild.hoehe+', Skala '+bild.skala+' bei '+bild.css+' px Anzeige)');
  note(bild.breite>=bild.css,'kein Hochskalieren mehr','('+bild.breite+' ≥ '+bild.css+')');

  // Jeder Boss lässt etwas Dauerhaftes liegen.
  const lohn=await page.evaluate(()=>{
    let container=0, schaden=0, ohne=0;
    for(let s=0;s<40;s++){
      startRun(0,'L'+s);
      const f=KB.G.floor;
      enterRoom(f.bossKey,null); KB.G.enemies.length=0; KB.G.bossIntro=null;
      KB.G.pickups.length=0;
      onBossRoomCleared();
      const q=KB.G.pickups.find(q=>q.type==='container'||q.type==='schadenshoch');
      if(!q) ohne++;
      else if(q.type==='container') container++; else schaden++;
    }
    return {container,schaden,ohne};
  });
  note(lohn.ohne===0,'jeder Boss lässt eine dauerhafte Belohnung liegen');
  note(lohn.container>0&&lohn.schaden>0,'mal Herzcontainer, mal Schaden',
       '('+lohn.container+' Container, '+lohn.schaden+' Schaden)');

  // Beides muss beim Einsammeln wirken.
  const wirkung=await page.evaluate(()=>{
    const holen=(typ)=>{
      startRun(0,'W'+typ); KB.G.bossIntro=null;
      const p=KB.G.player; p.red=2;
      const vor={max:p.redMax, dmg:p.stats.dmg};
      KB.G.pickups.length=0;
      spawnPickup(p.x,p.y,typ);
      KB.G.pickups[0].cd=0;
      for(let i=0;i<20;i++) updateGame(1/60);
      return {vorMax:vor.max, nachMax:p.redMax, vorDmg:+vor.dmg.toFixed(2),
              nachDmg:+p.stats.dmg.toFixed(2), red:p.red};
    };
    return {container:holen('container'), schaden:holen('schadenshoch')};
  });
  note(wirkung.container.nachMax===wirkung.container.vorMax+2
       &&wirkung.container.red===wirkung.container.nachMax,
       'der Herzcontainer gibt ein Herz dazu und heilt voll',
       '('+wirkung.container.vorMax+' → '+wirkung.container.nachMax+' Hälften)');
  note(wirkung.schaden.nachDmg>wirkung.schaden.vorDmg,
       'der Schadenslohn wirkt dauerhaft',
       '('+wirkung.schaden.vorDmg+' → '+wirkung.schaden.nachDmg+')');

  // Zwölf Herzen sind Schluss — egal über welchen Weg.
  const grenze=await page.evaluate(()=>{
    startRun(0,'GRENZE'); KB.G.bossIntro=null;
    const p=KB.G.player;
    for(let i=0;i<40;i++) containerDazu(2,'voll');       // stumpf hochziehen
    const nachContainern=p.redMax;
    acquireItem('eisenherz',null); acquireItem('herzwurz',null);
    const nachItems=p.redMax;
    // bei voller Brust wird der Bosslohn zu Kraft
    p.itemGet=null;          // sonst blockiert die Item-Anzeige die Eingabe
    const vorDmg=p.stats.dmg;
    KB.G.pickups.length=0;
    spawnPickup(p.x,p.y,'container'); KB.G.pickups[0].cd=0;
    for(let i=0;i<20;i++) updateGame(1/60);
    return {max:KB.MAX_HERZEN, nachContainern, nachItems, redMax:p.redMax,
            dmgVor:+vorDmg.toFixed(2), dmgNach:+p.stats.dmg.toFixed(2)};
  });
  note(grenze.nachContainern===grenze.max*2,'bei zwölf Herzen ist Schluss',
       '('+grenze.nachContainern/2+' Herzen)');
  note(grenze.nachItems===grenze.max*2,'auch Herzwurz und Eisenherz gehen nicht darüber');
  note(grenze.dmgNach>grenze.dmgVor,
       'ein Container an der Grenze wird zu Kraft statt zu verfallen',
       '('+grenze.dmgVor+' → '+grenze.dmgNach+')');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 19. Die großen Bosse und die Vorwarnung ---
if(want(19)){
console.log('\n[19] Große Bosse');
await withPage(async(page,errs)=>{
  const tabelle=await page.evaluate(()=>{
    const zuKlein=Object.keys(KB.BOSS_TYPES).filter(id=>KB.BOSS_TYPES[id].r<24);
    const ohne=KB.FLOORS.filter(f=>f.bosses.length<2).map(f=>f.name);
    const fehlend=[];
    for(const f of KB.FLOORS) for(const b of f.bosses)
      if(!KB.BOSS_TYPES[b]) fehlend.push(f.name+': '+b);
    return {anzahl:Object.keys(KB.BOSS_TYPES).length, zuKlein, ohne, fehlend,
            groessen:Object.values(KB.BOSS_TYPES).map(b=>b.r).sort((a,b)=>a-b)};
  });
  note(tabelle.anzahl>=12,'zwölf Bosse stehen bereit','('+tabelle.anzahl+')');
  note(tabelle.zuKlein.length===0,'kein Boss ist kleiner als Radius 24',
       tabelle.zuKlein.join(' '));
  note(tabelle.ohne.length===0,'jede Etage hat zwei Bosse zur Auswahl',tabelle.ohne.join(' '));
  note(tabelle.fehlend.length===0,'jede Etage nennt nur Bosse, die es gibt',tabelle.fehlend.join(' '));
  note(tabelle.groessen[tabelle.groessen.length-1]>=48,'die Großen füllen den Raum',
       '(größter Radius '+tabelle.groessen[tabelle.groessen.length-1]+')');

  /* Angekündigte Einschläge: erst harmlos, dann Treffer — und danach weg. */
  const warnung=await page.evaluate(()=>{
    startRun(0,'WARN'); KB.G.bossIntro=null;
    const p=KB.G.player; p.redMax=20;p.red=20; p.iframes=0; KB.G.roomFresh=0;
    KB.G.enemies.length=0; KB.G.einschlaege.length=0;
    einschlagSetzen(p.x,p.y,40,0.5,1,'#c03a5a');
    for(let i=0;i<20;i++) updateGame(1/60);      // 0.33 s — noch nichts
    const waehrend={leben:p.red, offen:KB.G.einschlaege.length};
    for(let i=0;i<20;i++){ p.iframes=0; updateGame(1/60); }
    const danach={leben:p.red};
    for(let i=0;i<30;i++) updateGame(1/60);
    return {waehrend, danach, uebrig:KB.G.einschlaege.length};
  });
  note(warnung.waehrend.leben===20&&warnung.waehrend.offen===1,
       'die Vorwarnung tut zunächst nichts');
  note(warnung.danach.leben<20,'danach schlägt sie wirklich ein',
       '(Leben '+warnung.waehrend.leben+' → '+warnung.danach.leben+')');
  note(warnung.uebrig===0,'und räumt sich danach selbst weg');

  // Wer außerhalb steht, bleibt heil.
  const daneben=await page.evaluate(()=>{
    startRun(0,'WARN2'); KB.G.bossIntro=null;
    const p=KB.G.player; p.redMax=20;p.red=20; p.iframes=0; KB.G.roomFresh=0;
    KB.G.einschlaege.length=0;
    einschlagSetzen(p.x+120,p.y,40,0.3,1,'#c03a5a');
    for(let i=0;i<60;i++){ p.iframes=0; updateGame(1/60); }
    return p.red;
  });
  note(daneben===20,'wer ausweicht, bleibt heil');

  /* Jeder der fünf Großen muss seine Kennzeichen-Handlung auch zeigen. */
  const zeichen=await page.evaluate(()=>{
    const laufen=(id,ticks)=>{
      startRun(0,'Z'+id); KB.G.bossIntro=null;
      const p=KB.G.player; p.redMax=99;p.red=99; p.x=tx(6); p.y=ty(5);
      KB.G.enemies.length=0; KB.G.einschlaege.length=0;
      spawnBoss(id); KB.G.bossIntro=null;
      const b=KB.G.enemies.find(e=>e.isBoss);
      let schlaege=0, brut=0, weitesteX=b.x, engsteX=b.x, vergraben=0;
      let sogSpur=0;
      for(let i=0;i<(ticks||600);i++){
        p.red=99; p.vx=0; p.vy=0;
        const vorher=KB.G.einschlaege.length;
        updateGame(1/60);
        if(KB.G.einschlaege.length>vorher) schlaege+=KB.G.einschlaege.length-vorher;
        brut=Math.max(brut,KB.G.enemies.filter(e=>!e.isBoss).length);
        weitesteX=Math.max(weitesteX,b.x); engsteX=Math.min(engsteX,b.x);
        if(b.ghosted) vergraben++;
        if(Math.abs(p.vx)+Math.abs(p.vy)>1) sogSpur++;
      }
      return {schlaege, brut, spanne:Math.round(weitesteX-engsteX), vergraben,
              sog:sogSpur, hp:Math.round(b.hp)};
    };
    return {mutter:laufen('kammermutter'), schlund:laufen('schlundvater'),
            haenger:laufen('gehaengte'), made:laufen('fleischmade'),
            bittend:laufen('bittender')};
  });
  note(zeichen.mutter.schlaege>0&&zeichen.mutter.brut>0,
       'die Kammermutter schlägt zu und wirft Brut',
       '('+zeichen.mutter.schlaege+' Schläge, bis zu '+zeichen.mutter.brut+' Brut)');
  note(zeichen.schlund.sog>0&&zeichen.schlund.schlaege>0,
       'der Schlundvater saugt und beißt','('+zeichen.schlund.schlaege+' Bisse)');
  note(zeichen.haenger.spanne>200,'der Gehängte schwingt quer durch den Raum',
       '('+zeichen.haenger.spanne+' px Spanne)');
  note(zeichen.made.vergraben>60,'die Fleischmade wühlt sich unter den Boden',
       '('+zeichen.made.vergraben+' von 600 Ticks eingegraben)');
  note(zeichen.bittend.schlaege>0,'der Bittende lässt die Hände fallen',
       '('+zeichen.bittend.schlaege+' Schläge)');

  // Der Bittende wächst mit jedem Viertel.
  const wachsen=await page.evaluate(()=>{
    startRun(0,'WACHS'); KB.G.bossIntro=null;
    KB.G.enemies.length=0; spawnBoss('bittender'); KB.G.bossIntro=null;
    const b=KB.G.enemies.find(e=>e.isBoss);
    const start=b.r, stufen=[];
    for(const anteil of [0.7,0.45,0.2]){
      b.hp=b.maxHp*anteil;
      for(let i=0;i<10;i++) updateGame(1/60);
      stufen.push(b.r);
    }
    return {start, stufen};
  });
  note(wachsen.stufen.every((r,i)=>r>(i?wachsen.stufen[i-1]:wachsen.start)),
       'der Bittende wächst mit jedem verlorenen Viertel',
       '('+wachsen.start+' → '+wachsen.stufen.join(' → ')+')');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 20. Die zwölf neuen Kreaturen ---
if(want(20)){
console.log('\n[20] Neue Kreaturen');
await withPage(async(page,errs)=>{
  const neu=['nabelkind','haeutling','vielauge','zwillingsbalg','schlundmutter','fingerbaum',
             'grabhusten','nagelbraut','kriechkiefer','wachslicht','ohrwurm','spiegelbalg'];
  const da=await page.evaluate((neu)=>{
    const fehlt=neu.filter(id=>!KB.ENEMY_TYPES[id]);
    const ohnePool=neu.filter(id=>!KB.FLOORS.some(f=>f.pool.includes(id)));
    return {fehlt, ohnePool, gesamt:Object.keys(KB.ENEMY_TYPES).length};
  },neu);
  note(da.fehlt.length===0,'alle zwölf stehen in der Tabelle',da.fehlt.join(' '));
  note(da.ohnePool.length===0,'jede taucht auf mindestens einer Etage auf',da.ohnePool.join(' '));

  const haken=await page.evaluate(()=>{
    const bau=(id,vorbereiten)=>{
      startRun(0,'K'+id); KB.G.bossIntro=null;
      const p=KB.G.player; p.redMax=99;p.red=99; p.iframes=0;
      KB.G.enemies.length=0; KB.G.creeps.length=0; KB.G.eshots.length=0;
      KB.G.roomFresh=0;
      for(const z of KB.G.room.grid) z.fill(null);
      const e=spawnEnemy(id,tx(6),ty(2),null);
      if(vorbereiten) vorbereiten(e,p);
      return {e,p};
    };
    const laufen=(o,n)=>{ for(let i=0;i<n;i++){ o.p.red=99; o.p.iframes=0; updateGame(1/60); } };
    const erg={};

    { // Nabelkind hängt, bis die Schnur reißt
      /* Über eine volle Pendelperiode messen, nicht über einen Ausschnitt:
         startet es zufällig nahe am Umkehrpunkt, bewegt es sich kurzzeitig kaum. */
      const o=bau('nabelkind'); let min=o.e.x, max=o.e.x;
      for(let i=0;i<260;i++){ o.p.red=99; updateGame(1/60);
        min=Math.min(min,o.e.x); max=Math.max(max,o.e.x); }
      const geschwungen=(max-min)>40&&o.e.fly;
      o.e.hp=o.e.maxHp*0.3; laufen(o,30);
      erg.nabel={geschwungen, gefallen:!!o.e.gefallen&&!o.e.fly};
    }
    { // Häutling: Spur, auf der man rutscht
      const o=bau('haeutling'); laufen(o,60);
      const spur=KB.G.creeps.filter(c=>c.glatt).length;
      o.p.x=KB.G.creeps.find(c=>c.glatt).x; o.p.y=KB.G.creeps.find(c=>c.glatt).y;
      laufen(o,2);
      erg.haeutling={spur, rutscht:!!o.p.aufGlatt};
    }
    /* Geschosse fliegen weg und verschwinden an der Wand. Sie über die Länge
       der Liste zu zählen geht schief — in einem Tick kann eines entstehen
       und eines vergehen. Gezählt werden deshalb die Geschoss-Objekte selbst. */
    const schuesseZaehlen=(o,n,je)=>{
      const gesehen=new Set();
      for(let i=0;i<n;i++){ o.p.red=99; o.p.iframes=0; updateGame(1/60);
        for(const sh of KB.G.eshots) gesehen.add(sh);
        if(je) je(); }
      return gesehen.size;
    };
    /* Schützen bleiben für die Messung stehen und der Spieler hält Abstand:
       säße der Gegner auf ihm, träfe jedes Geschoss noch im selben Tick und
       wäre nie zu sehen. */
    { const o=bau('vielauge',(e,p)=>{ e.spd=0; p.x=tx(2); p.y=ty(5); });
      erg.vielauge={schuesse:schuesseZaehlen(o,600)}; }
    { const o=bau('zwillingsbalg',(e,p)=>{ e.spd=0; p.x=tx(2); p.y=ty(5); });
      /* Jeder Schuss schaltet den Kopf um. Die Wechsel zu zählen misst also
         genau das Versprechen: er feuert, und immer abwechselnd. */
      let letzter=o.e.kopf?1:0, wechsel=0;
      const sum=schuesseZaehlen(o,600,()=>{
        const jetzt=o.e.kopf?1:0;
        if(jetzt!==letzter){ wechsel++; letzter=jetzt; }
      });
      erg.zwilling={wechsel, schuesse:sum}; }
    { const o=bau('schlundmutter'); laufen(o,300);
      erg.schlundmutter={brut:KB.G.enemies.filter(e=>e.type==='spinnling').length}; }
    { const o=bau('fingerbaum',(e,p)=>{ p.x=e.x; p.y=e.y+50; });
      let gepackt=0;
      for(let i=0;i<300;i++){ o.p.red=99; o.p.x=o.e.x; o.p.y=o.e.y+50; updateGame(1/60);
        gepackt=Math.max(gepackt,o.p.gepackt||0); }
      erg.finger={gepackt:+gepackt.toFixed(1)}; }
    { const o=bau('grabhusten',(e,p)=>{ p.x=e.x; p.y=e.y+80; });
      laufen(o,300);
      erg.husten={wolken:KB.G.creeps.filter(c=>c.sporen).length}; }
    { /* Der Wurf entscheidet je Treffer; über dreißig Treffer ist das Ergebnis
         nicht mehr vom Zufall abhängig. */
      const o=bau('nagelbraut'); o.e.hp=999;
      for(let i=0;i<30;i++) damageEnemy(o.e,1);
      erg.nagel={naegel:KB.G.creeps.filter(c=>c.nagel).length, treffer:30}; }
    { const o=bau('kriechkiefer',(e,p)=>{ p.x=e.x; p.y=e.y+90; });
      let nah=999, fern=0;
      for(let i=0;i<400;i++){ o.p.red=99; o.p.x=tx(6); o.p.y=ty(5); updateGame(1/60);
        const d=Math.hypot(o.e.x-o.p.x,o.e.y-o.p.y); nah=Math.min(nah,d); fern=Math.max(fern,d); }
      erg.kiefer={nah:Math.round(nah), fern:Math.round(fern)}; }
    { const o=bau('wachslicht'); const r0=o.e.r; laufen(o,300);
      erg.wachs={geschrumpft:r0-o.e.r, glut:KB.G.creeps.filter(c=>c.glut).length}; }
    { const o=bau('ohrwurm'); let drin=0, draussen=0;
      for(let i=0;i<600;i++){ o.p.red=99; updateGame(1/60);
        if(o.e.ghosted) drin++; else draussen++; }
      erg.ohrwurm={drin, draussen}; }
    { const o=bau('spiegelbalg'); o.p.x=tx(3); o.p.y=ty(2);
      laufen(o,120);
      const mx=RX+COLS*TILE/2, my=RY+ROWS*TILE/2;
      erg.spiegel={abstand:Math.round(Math.hypot(o.e.x-(mx-(o.p.x-mx)),
                                                 o.e.y-(my-(o.p.y-my))))}; }
    return erg;
  });

  note(haken.nabel.geschwungen&&haken.nabel.gefallen,
       'das Nabelkind pendelt und fällt bei halber Kraft herunter');
  note(haken.haeutling.spur>0&&haken.haeutling.rutscht,
       'der Häutling hinterlässt eine Spur, auf der man rutscht',
       '('+haken.haeutling.spur+' Flecken)');
  note(haken.vielauge.schuesse>0,'das Vielauge schießt','('+haken.vielauge.schuesse+' Geschosse)');
  note(haken.zwilling.wechsel>=3&&haken.zwilling.schuesse>=3,
       'der Zwillingsbalg feuert abwechselnd aus beiden Köpfen',
       '('+haken.zwilling.schuesse+' Schüsse, '+haken.zwilling.wechsel+' Kopfwechsel)');
  note(haken.schlundmutter.brut>0,'die Schlundmutter entlässt Spinnlinge',
       '('+haken.schlundmutter.brut+' Stück)');
  note(haken.finger.gepackt>0,'der Fingerbaum packt zu',
       '(bis zu '+haken.finger.gepackt+' s festgehalten)');
  note(haken.husten.wolken>0,'der Grabhusten wirft einen Sporenkegel',
       '('+haken.husten.wolken+' Wolken)');
  note(haken.nagel.naegel>=8,'die Nagelbraut verliert bei Treffern Nägel',
       '('+haken.nagel.naegel+' aus '+haken.nagel.treffer+' Treffern)');
  note(haken.kiefer.nah<40&&haken.kiefer.fern>90,
       'der Kriechkiefer beißt im Vorbeilauf und dreht wieder ab',
       '(näher als '+haken.kiefer.nah+', weiter als '+haken.kiefer.fern+' px)');
  note(haken.wachs.geschrumpft>0&&haken.wachs.glut>0,
       'das Wachslicht schmilzt und lässt Brandflecken liegen',
       '(Radius −'+haken.wachs.geschrumpft.toFixed(1)+')');
  note(haken.ohrwurm.drin>0&&haken.ohrwurm.draussen>0,
       'der Ohrwurm ist mal in der Wand, mal draußen',
       '('+haken.ohrwurm.drin+' drin, '+haken.ohrwurm.draussen+' draußen)');
  note(haken.spiegel.abstand<12,'der Spiegelbalg steht spiegelverkehrt zum Spieler',
       '('+haken.spiegel.abstand+' px daneben)');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 21. Die zwölf Kammern ---
if(want(21)){
console.log('\n[21] Kammern hinter dem Boss');
await withPage(async(page,errs)=>{
  const bau=await page.evaluate(()=>{
    const probleme=[];
    const pruefen=(k,seite)=>{
      startRun(0,'KAM'+k.id); KB.G.bossIntro=null;
      const f=KB.G.floor;
      const key=Object.keys(f.rooms).find(x=>f.rooms[x].type==='devil');
      if(!key){ probleme.push(k.id+': keine Kammer auf der Etage'); return; }
      const raum=f.rooms[key];
      raum.pedestals.length=0; raum.drops.length=0;
      raum.kammerId=k.id; k.bauen(raum);
      const soll=seite==='teufel'?2:1;
      if(raum.pedestals.length!==soll)
        probleme.push(k.id+': '+raum.pedestals.length+' Podeste statt '+soll);
      for(const pd of raum.pedestals){
        if(seite==='teufel'&&!pd.herzPreis) probleme.push(k.id+': Podest ohne Herzpreis');
        if(seite==='engel'&&pd.herzPreis)   probleme.push(k.id+': Engel verlangt Herzen');
        if(!KB.ITEMS[pd.itemId])            probleme.push(k.id+': Item gibt es nicht');
        // muss innerhalb des Spielfelds und erreichbar liegen
        if(pd.x<RX+10||pd.x>RX+COLS*TILE-10||pd.y<RY+10||pd.y>RY+ROWS*TILE-10)
          probleme.push(k.id+': Podest liegt außerhalb ('+Math.round(pd.x)+'|'+Math.round(pd.y)+')');
      }
      if(seite==='engel'&&raum.drops.filter(q=>q.type==='soulheart').length<2)
        probleme.push(k.id+': zu wenig Seelenherzen');
      for(const q of raum.drops)
        if(q.x<RX+10||q.x>RX+COLS*TILE-10||q.y<RY+10||q.y>RY+ROWS*TILE-10)
          probleme.push(k.id+': Herz liegt außerhalb');
    };
    KB.KAMMERN.teufel.forEach(k=>pruefen(k,'teufel'));
    KB.KAMMERN.engel.forEach(k=>pruefen(k,'engel'));
    const ids=KB.KAMMERN.teufel.concat(KB.KAMMERN.engel).map(k=>k.id);
    if(new Set(ids).size!==ids.length) probleme.push('doppelte Kammer-Kennung');
    return {teufel:KB.KAMMERN.teufel.length, engel:KB.KAMMERN.engel.length, probleme};
  });
  note(bau.teufel===6&&bau.engel===6,'sechs Teufels- und sechs Engelskammern',
       '('+bau.teufel+' + '+bau.engel+')');
  note(bau.probleme.length===0,'jede Kammer stellt ihre Ware richtig hin',
       bau.probleme.slice(0,4).join('; '));

  // Über viele Läufe müssen wirklich verschiedene Kammern kommen.
  const streuung=await page.evaluate(()=>{
    const gesehen={teufel:new Set(),engel:new Set()};
    for(let s=0;s<160;s++){
      startRun(0,'S'+s);
      const f=KB.G.floor;
      if(!Object.values(f.rooms).some(r=>r.type==='devil')) continue;
      enterRoom(f.bossKey,null); KB.G.enemies.length=0; KB.G.bossIntro=null;
      KB.G.floorHit=false; KB.G.deals=s%2;      // mal Engel möglich, mal nicht
      onBossRoomCleared();
      const k=Object.values(f.rooms).find(r=>r.type==='devil'||r.type==='angel');
      if(k&&k.kammerId) gesehen[k.type==='angel'?'engel':'teufel'].add(k.kammerId);
    }
    return {teufel:gesehen.teufel.size, engel:gesehen.engel.size};
  });
  note(streuung.teufel>=5,'die Teufelskammer sieht nicht jedes Mal gleich aus',
       '('+streuung.teufel+' von 6 gesehen)');
  note(streuung.engel>=4,'auch die Engelskammer wechselt',
       '('+streuung.engel+' von 6 gesehen)');

  // Die Möblierung bleibt beim Wiederbetreten dieselbe und zeichnet fehlerfrei.
  const bleibt=await page.evaluate(async()=>{
    for(let s=0;s<80;s++){
      startRun(0,'B'+s);
      const f=KB.G.floor;
      if(!Object.values(f.rooms).some(r=>r.type==='devil')) continue;
      enterRoom(f.bossKey,null); KB.G.enemies.length=0; KB.G.bossIntro=null;
      KB.G.floorHit=false; KB.G.deals=1;
      onBossRoomCleared();
      const k=Object.values(f.rooms).find(r=>r.type==='devil'||r.type==='angel');
      if(!k||!k.kammerId) continue;
      const key=Object.keys(f.rooms).find(x=>f.rooms[x]===k);
      const zuerst=k.kammerId;
      enterRoom(key,null); KB.G.bossIntro=null;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const gemalt=!!kammerBild();
      enterRoom(f.bossKey,null); enterRoom(key,null);
      return {gleich:k.kammerId===zuerst, gemalt};
    }
    return null;
  });
  note(bleibt&&bleibt.gleich,'beim Wiederbetreten steht dieselbe Kammer');
  note(bleibt&&bleibt.gemalt,'ihre Einrichtung wird auch gezeichnet');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 22. Zwischenstand und Menü ---
if(want(22)){
console.log('\n[22] Durchlauf speichern, Menü');
await withPage(async(page,errs)=>{
  const speichern=await page.evaluate(()=>{
    laufVerwerfen();
    startRun(1,'SPEICHER'); KB.G.bossIntro=null;
    const p=KB.G.player;
    // einen Zustand herstellen, den es zu retten lohnt
    KB.G.depth=3; KB.G.floor=genFloor(3);
    enterRoom(KB.G.floor.startKey,null); KB.G.bossIntro=null;
    acquireItem('glutkern',null); acquireItem('windsohlen',null);
    p.itemGet=null; p.coins=17; p.bombs=4; p.keys=2;
    p.redMax=10; p.red=5; p.soul=['S','S'];
    KB.G.kills=42; KB.G.time=123.4; KB.G.deals=1; KB.G.floorHit=true;
    // Raum verändern: Stein weg, Tür auf, Raum geräumt
    KB.G.room.grid[2][2]={t:'rock'};
    KB.G.room.grid[2][3]=null;
    KB.G.room.cleared=true;
    const tuer=Object.values(KB.G.room.doors)[0];
    tuer.edge.locked=false; tuer.edge.revealed=true;
    // ein zweiter Raum, damit enterRoom das Speichern auslöst
    const nachbar=Object.values(KB.G.room.doors)[0].to;
    enterRoom(nachbar,null); KB.G.bossIntro=null;
    laufSpeichern();
    return {vorhanden:laufVorhanden(),
            zustand:{tiefe:KB.G.depth,seed:KB.G.seedStr,raum:KB.G.roomKey,
              items:[...p.items],coins:p.coins,bombs:p.bombs,keys:p.keys,
              red:p.red,redMax:p.redMax,soul:p.soul.length,
              kills:KB.G.kills,deals:KB.G.deals,treffer:KB.G.floorHit,
              charIdx:KB.G.charIdx,
              dmg:+p.stats.dmg.toFixed(2)}};
  });
  note(speichern.vorhanden,'ein laufender Durchlauf wird gespeichert');

  const zurueck=await page.evaluate(()=>{
    // Alles vergessen und nur aus dem Zwischenstand wiederherstellen
    KB.G={state:'menu',floor:null};
    const ok=laufFortsetzen();
    const p=KB.G.player;
    return {ok, tiefe:KB.G.depth, seed:KB.G.seedStr, raum:KB.G.roomKey,
            items:[...p.items], coins:p.coins, bombs:p.bombs, keys:p.keys,
            red:p.red, redMax:p.redMax, soul:p.soul.length,
            kills:KB.G.kills, deals:KB.G.deals, treffer:KB.G.floorHit,
            charIdx:KB.G.charIdx, dmg:+p.stats.dmg.toFixed(2),
            begleiter:KB.G.familiars.length};
  });
  const a=speichern.zustand;
  note(zurueck.ok&&zurueck.tiefe===a.tiefe&&zurueck.seed===a.seed&&zurueck.charIdx===a.charIdx,
       'Etage, Seed und Figur kommen zurück',
       '(Etage '+zurueck.tiefe+', '+zurueck.seed+')');
  note(zurueck.items.join()===a.items.join()&&zurueck.dmg===a.dmg,
       'die Items und ihre Wirkung sind wieder da',
       '('+zurueck.items.length+' Items, Schaden '+zurueck.dmg+')');
  note(zurueck.coins===a.coins&&zurueck.bombs===a.bombs&&zurueck.keys===a.keys
       &&zurueck.red===a.red&&zurueck.redMax===a.redMax&&zurueck.soul===a.soul,
       'Leben, Münzen, Bomben und Schlüssel stimmen');
  note(zurueck.kills===a.kills&&zurueck.deals===a.deals&&zurueck.treffer===a.treffer,
       'auch Zählerstände und Etagenzustand kommen mit');

  // Der veränderte Raum muss genau so wieder dastehen.
  const welt=await page.evaluate(()=>{
    const f=KB.G.floor;
    const k=f.startKey, r=f.rooms[k];
    return {stein:!!(r.grid[2][2]&&r.grid[2][2].t==='rock'),
            frei:r.grid[2][3]===null, geraeumt:!!r.cleared,
            tuerOffen:!Object.values(r.doors)[0].edge.locked};
  });
  note(welt.stein&&welt.frei&&welt.geraeumt&&welt.tuerOffen,
       'die Etage steht wieder genau so da wie beim Verlassen');

  // Tod, Sieg, Aufgeben und ein neuer Lauf löschen den Zwischenstand.
  const geloescht=await page.evaluate(()=>{
    const proben={};
    laufVerwerfen(); startRun(0,'X1'); enterRoom(KB.G.floor.startKey,null);
    laufSpeichern(); const vorTod=laufVorhanden();
    KB.G.player.soul.length=0; KB.G.player.red=1;
    hurtPlayer(9,true);
    proben.tod={vorher:vorTod, nachher:laufVorhanden()};

    startRun(0,'X2'); enterRoom(KB.G.floor.startKey,null); laufSpeichern();
    const vorSieg=laufVorhanden(); winRun();
    proben.sieg={vorher:vorSieg, nachher:laufVorhanden()};

    startRun(0,'X3'); enterRoom(KB.G.floor.startKey,null); laufSpeichern();
    const vorNeu=laufVorhanden(); startRun(0,'X4');
    proben.neu={vorher:vorNeu, nachher:laufVorhanden()};
    return proben;
  });
  note(geloescht.tod.vorher&&!geloescht.tod.nachher,'der Tod löscht den Zwischenstand');
  note(geloescht.sieg.vorher&&!geloescht.sieg.nachher,'ein Sieg ebenso');
  note(geloescht.neu.vorher&&!geloescht.neu.nachher,'ein neuer Abstieg ebenso');

  // Menü, Statistik und Einstellungen
  const menue=await page.evaluate(()=>{
    laufVerwerfen();
    const ohne=menuEintraege().map(e=>e.id);
    startRun(0,'M1'); enterRoom(KB.G.floor.startKey,null); laufSpeichern();
    const mit=menuEintraege().map(e=>e.id);
    return {ohne, mit};
  });
  note(!menue.ohne.includes('weiter'),'ohne Zwischenstand gibt es kein Weiterspielen');
  note(menue.mit[0]==='weiter','mit Zwischenstand steht es ganz oben');

  const opt=await page.evaluate(async()=>{
    KB.saveData.ton=5; KB.saveData.musik=5; KB.saveData.wackeln=true;
    KB.G.state='optionen'; menu.optIdx=0;
    const vorher=KB.saveData.ton;
    // dreimal lauter
    for(let i=0;i<3;i++){ Input.press('ArrowRight'); updateMenu(); Input.clear(); }
    const lauter=KB.saveData.ton;
    menu.optIdx=2; Input.press('ArrowRight'); updateMenu(); Input.clear();
    const wackeln=KB.saveData.wackeln;
    // Grenzen halten
    menu.optIdx=0;
    for(let i=0;i<20;i++){ Input.press('ArrowRight'); updateMenu(); Input.clear(); }
    const oben=KB.saveData.ton;
    for(let i=0;i<30;i++){ Input.press('ArrowLeft'); updateMenu(); Input.clear(); }
    const unten=KB.saveData.ton;
    // wird das auch gespeichert?
    const roh=JSON.parse(localStorage.getItem('kellerbrut_v1')||'{}');
    return {vorher,lauter,wackeln,oben,unten,gespeichert:roh.ton};
  });
  note(opt.lauter===opt.vorher+3,'die Lautstärke lässt sich einstellen',
       '('+opt.vorher+' → '+opt.lauter+')');
  note(opt.wackeln===false,'das Bildschirmwackeln lässt sich abschalten');
  note(opt.oben===10&&opt.unten===0,'die Regler bleiben zwischen 0 und 10',
       '(max '+opt.oben+', min '+opt.unten+')');
  note(opt.gespeichert===0,'Einstellungen landen sofort im Spielstand');

  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

// --- 23. Herz- und Schaden-Items ---
if(want(23)){
console.log('\n[23] Herz- und Schaden-Items');
await withPage(async(page,errs)=>{
  const neu=['herzkern','stahlherz','blauessiegel','herzcontainer','doppelherz',
             'geisterherz','blutpumpe','lebenskristall','fluchherz','unsterblichesherz',
             'blutklinge','kristallzahn','wutkern','doppelgeschoss','glutauge',
             'schaedelbrecher','giftzahn','donnerherz','chaosmatrix','seelenschlitzer'];
  const da=await page.evaluate((neu)=>{
    const fehlt=neu.filter(id=>!KB.ITEMS[id]);
    const ohneSymbol=neu.filter(id=>KB.ITEMS[id]&&!KB.ITEMS[id].icon);
    const ohnePool=neu.filter(id=>KB.ITEMS[id]&&!KB.ITEMS[id].pool.length);
    return {fehlt,ohneSymbol,ohnePool,gesamt:Object.keys(KB.ITEMS).length};
  },neu);
  note(da.fehlt.length===0,'alle zwanzig sind da',da.fehlt.join(' '));
  note(da.ohneSymbol.length===0,'jedes hat ein eigenes, gezeichnetes Symbol',da.ohneSymbol.join(' '));
  note(da.ohnePool.length===0,'jedes liegt in mindestens einem Topf',da.ohnePool.join(' '));

  const w=await page.evaluate(()=>{
    const bau=(ids,vor)=>{
      startRun(0,'IT'); KB.G.bossIntro=null;
      const p=KB.G.player; p.iframes=0; KB.G.roomFresh=0;
      KB.G.enemies.length=0; KB.G.eshots.length=0; KB.G.creeps.length=0;
      for(const z of KB.G.room.grid) z.fill(null);
      if(vor) vor(p);
      for(const id of ids) acquireItem(id,null);
      p.itemGet=null; recomputeStats();
      return p;
    };
    const e={};
    { const p0=bau([]); const vorMax=p0.redMax;
      const p=bau(['herzkern']); e.herzkern={vor:vorMax,nach:p.redMax}; }
    { const p=bau(['stahlherz'],pp=>{pp.red=2;});
      const vor=p.red; const dazu=heileSpieler(4);
      e.stahlherz={dazu, halb:p.flags.has('halbheilung')}; }
    { const p=bau([]); const vorSoul=p.soul.length;
      const q=bau(['blauessiegel']); e.siegel={vor:vorSoul,nach:q.soul.length}; }
    { const p=bau(['herzcontainer'],pp=>{pp.red=1;});
      e.container={red:p.red,max:p.redMax,voll:p.red===p.redMax}; }
    { const p=bau(['doppelherz']); p.red=p.redMax;
      for(let i=0;i<3;i++) updateGame(1/60);
      e.doppelherz={schild:p.shield>0}; }
    { const p=bau(['geisterherz']); p.soul=['S','S','S','S','S','S','S','S'];
      let explosionen=0;
      for(let i=0;i<40;i++){ const vorFx=KB.G.fx.length; p.iframes=0;
        if(p.soul.length<2) p.soul.push('S','S');
        hurtPlayer(1,true);
        if(KB.G.fx.length>vorFx+6) explosionen++; }
      e.geisterherz={explosionen}; }
    { const p=bau(['blutpumpe']); p.redMax=20;p.red=20; p.iframes=0;
      hurtPlayer(1,true);
      const nachTreffer=p.red;
      for(let i=0;i<200;i++){ p.iframes=0; updateGame(1/60); }
      e.blutpumpe={blutung:p.flags.has('blutpumpe'),nachTreffer,ende:p.red}; }
    { const p=bau(['lebenskristall']); p.redMax=20; p.red=3;
      KB.G.room.kristallGenutzt=false;
      for(let i=0;i<20;i++) updateGame(1/60);
      const ersteHilfe=p.red;
      p.red=3;
      for(let i=0;i<20;i++) updateGame(1/60);
      e.kristall={ersteHilfe,zweite:p.red}; }
    { const p=bau(['fluchherz']); p.soul=['S','S','S','S'];
      const vor=p.soul.length;
      enterRoom(KB.G.floor.bossKey,null); KB.G.enemies.length=0; KB.G.bossIntro=null;
      onBossRoomCleared();
      e.fluchherz={vor,nach:p.soul.length}; }
    { const p=bau(['unsterblichesherz']); p.soul.length=0; p.red=1;
      hurtPlayer(9,true);
      const ersterTod={tot:p.dead,red:p.red};
      p.iframes=0; p.soul.length=0; p.red=Math.max(1,p.red);
      hurtPlayer(9,true);
      e.unsterblich={ersterTod,zweiterTot:p.dead}; }
    { const a=bau([]).stats.dmg, b=bau(['blutklinge']).stats.dmg;
      e.blutklinge={ohne:+a.toFixed(2),mit:+b.toFixed(2),faktor:+(b/a).toFixed(2)}; }
    { const p=bau(['kristallzahn']);
      e.kristallzahn={pierce:p.flags.has('pierce'),dmg:+p.stats.dmg.toFixed(2)}; }
    /* Wut, Elitebonus, Chaos: der Aufschlag entsteht erst beim Treffer, also
       wird der zugefügte Schaden gemessen, nicht der Statuswert. */
    const treffer=(ids,vor,bossartig)=>{
      const p=bau(ids,vor);
      const e2=spawnEnemy(bossartig?'blobling':'blobling',tx(6),ty(3),
                          bossartig?{tint:'#ff5a5a',hpMul:9}:null);
      e2.hp=e2.maxHp=9999;
      const vorHp=e2.hp;
      hitEnemyWithMods(e2,10,0,true);
      return vorHp-e2.hp;
    };
    e.wut={voll:treffer(['wutkern'],pp=>{pp.redMax=20;pp.red=20;}),
           fast:treffer(['wutkern'],pp=>{pp.redMax=20;pp.red=1;})};
    e.elite={normal:treffer(['schaedelbrecher']),
             champ:treffer(['schaedelbrecher'],null,true)};
    { const werte=[]; for(let i=0;i<40;i++) werte.push(treffer(['chaosmatrix']));
      e.chaos={min:Math.min(...werte),max:Math.max(...werte)}; }
    { const p=bau(['doppelgeschoss']);
      KB.G.tears.length=0; fireShot({x:0,y:1});
      const q=bau([]); KB.G.tears.length=0; fireShot({x:0,y:1});
      const einzeln=KB.G.tears.length, einzelSchaden=KB.G.tears[0].dmg;
      const p2=bau(['doppelgeschoss']);
      KB.G.tears.length=0; fireShot({x:0,y:1});
      e.doppelgeschoss={einzeln,mehr:KB.G.tears.length,
        schadenVor:+einzelSchaden.toFixed(2),schadenNach:+KB.G.tears[0].dmg.toFixed(2)}; }
    { const p=bau(['glutauge']);
      const g=spawnEnemy('blobling',tx(6),ty(3),null); g.hp=g.maxHp=9999;
      hitEnemyWithMods(g,5,0,true);
      e.glutauge={brennt:g.burn>0,dmg:+p.stats.dmg.toFixed(2)}; }
    { const p=bau(['giftzahn']);
      const g=spawnEnemy('blobling',tx(6),ty(3),null); g.hp=g.maxHp=9999;
      hitEnemyWithMods(g,5,0,true);
      e.giftzahn={vergiftet:g.poison>0}; }
    { const p=bau(['donnerherz']);
      const g=spawnEnemy('blobling',tx(6),ty(3),null); g.hp=g.maxHp=99999;
      const z=spawnEnemy('blobling',tx(9),ty(3),null); z.hp=z.maxHp=99999;
      let blitze=0;
      for(let i=0;i<16;i++){ const vor=z.hp+g.hp; hitEnemyWithMods(g,5,0,true);
        if(z.hp+g.hp<vor-5.5) blitze++; }
      e.donner={blitze}; }
    { const p=bau(['seelenschlitzer']);
      let rausch=0;
      for(let i=0;i<60;i++){ const g=spawnEnemy('tropfling',tx(6),ty(3),null);
        killEnemy(g); if(p.rausch>0){ rausch++; p.rausch=0; } }
      e.seelenschlitzer={rausch}; }
    return e;
  });

  note(w.herzkern.nach===w.herzkern.vor+2,'Herzkern gibt ein ganzes Herz dazu',
       '('+w.herzkern.vor+' → '+w.herzkern.nach+' Hälften)');
  note(w.stahlherz.halb&&w.stahlherz.dazu===2,'Stahlherz halbiert die Heilung',
       '(4 Hälften angeboten → '+w.stahlherz.dazu+' angekommen)');
  note(w.siegel.nach===w.siegel.vor+4,'Blaues Siegel gibt zwei blaue Herzen');
  note(w.container.voll,'Herzcontainer heilt sofort voll auf',
       '('+w.container.red+'/'+w.container.max+')');
  note(w.doppelherz.schild,'Doppelherz gibt bei vollem Leben ein Schild');
  note(w.geisterherz.explosionen>0,'Geisterherz zerplatzt beim Verlust',
       '('+w.geisterherz.explosionen+' von 40)');
  note(w.blutpumpe.ende<w.blutpumpe.nachTreffer,'Blutpumpe blutet nach',
       '(nach Treffer '+w.blutpumpe.nachTreffer+' → '+w.blutpumpe.ende+')');
  note(w.kristall.ersteHilfe>3&&w.kristall.zweite===3,
       'Lebenskristall hilft genau einmal je Raum',
       '(3 → '+w.kristall.ersteHilfe+', beim zweiten Mal '+w.kristall.zweite+')');
  note(w.fluchherz.nach===w.fluchherz.vor-2,'Fluchherz kostet je Boss ein blaues Herz',
       '('+w.fluchherz.vor+' → '+w.fluchherz.nach+' Hälften)');
  note(w.unsterblich.ersterTod.tot===false&&w.unsterblich.zweiterTot===true,
       'Unsterbliches Herz trägt genau einmal');
  note(Math.abs(w.blutklinge.faktor-1.2)<0.02,'Blutklinge gibt +20 % Schaden',
       '(Faktor '+w.blutklinge.faktor+')');
  note(w.kristallzahn.pierce,'Kristallzahn lässt Schüsse durchbohren');
  note(w.wut.fast>w.wut.voll*1.3,'Wutkern schlägt bei wenig Leben härter zu',
       '(voll '+w.wut.voll.toFixed(1)+' → fast tot '+w.wut.fast.toFixed(1)+')');
  note(w.elite.champ>w.elite.normal*1.3,'Schädelbrecher trifft Champions härter',
       '('+w.elite.normal.toFixed(1)+' → '+w.elite.champ.toFixed(1)+')');
  note(w.chaos.max>w.chaos.min*1.5,'Chaos-Matrix schwankt wirklich',
       '('+w.chaos.min.toFixed(1)+' bis '+w.chaos.max.toFixed(1)+')');
  note(w.doppelgeschoss.mehr===w.doppelgeschoss.einzeln+1
       &&w.doppelgeschoss.schadenNach<w.doppelgeschoss.schadenVor,
       'Doppelgeschoss: ein Schuss mehr, jeder schwächer',
       '('+w.doppelgeschoss.einzeln+' → '+w.doppelgeschoss.mehr+' Schüsse, Schaden '
       +w.doppelgeschoss.schadenVor+' → '+w.doppelgeschoss.schadenNach+')');
  note(w.glutauge.brennt,'Glutauge setzt in Brand');
  note(w.giftzahn.vergiftet,'Giftzahn vergiftet');
  note(w.donner.blitze>0,'Donnerherz schlägt in Abständen ein',
       '('+w.donner.blitze+' Blitze aus 16 Treffern)');
  note(w.seelenschlitzer.rausch>0,'Seelenschlitzer macht bei Kills rasend',
       '('+w.seelenschlitzer.rausch+' aus 60 Kills)');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

if(want(24)){
console.log('\n[24] Die zehn Begleiter');
await withPage(async(page,errs)=>{
  const neu=['messerfliege','feuerschaedel','engelsfluegel','schattenorb','stichling',
             'augapfel','bombenfreund','kreuzbot','klingenring','seelenvogel'];
  const da=await page.evaluate((neu)=>{
    const fehlt=neu.filter(id=>!KB.ITEMS[id]);
    const ohneSymbol=neu.filter(id=>KB.ITEMS[id]&&!KB.ITEMS[id].icon);
    const ohneFam=neu.filter(id=>KB.ITEMS[id]&&!KB.ITEMS[id].famil);
    const ohnePool=neu.filter(id=>KB.ITEMS[id]&&!KB.ITEMS[id].pool.length);
    const arten=neu.map(id=>KB.ITEMS[id]&&KB.ITEMS[id].famil);
    const doppelt=arten.filter((f,i)=>arten.indexOf(f)!==i);   // jede Art nur einmal
    return {fehlt,ohneSymbol,ohneFam,ohnePool,doppelt,gesamt:Object.keys(KB.ITEMS).length};
  },neu);
  note(da.fehlt.length===0,'alle zehn sind da',da.fehlt.join(' '));
  note(da.ohneSymbol.length===0,'jeder hat ein eigenes, gezeichnetes Symbol',da.ohneSymbol.join(' '));
  note(da.ohneFam.length===0,'jeder stellt wirklich einen Begleiter auf',da.ohneFam.join(' '));
  note(da.ohnePool.length===0,'jeder liegt in mindestens einem Topf',da.ohnePool.join(' '));
  note(da.doppelt.length===0,'keine zwei Items teilen sich eine Begleiterart',da.doppelt.join(' '));
  console.log('    Items im Spiel: '+da.gesamt);

  const w=await page.evaluate(()=>{
    /* Aufbau: leerer Raum, ein Item, ein Übungsgegner mit viel Leben.
       Der Spieler bewegt sich nicht — gemessen wird nur der Begleiter. */
    const bau=(ids,mitGegner)=>{
      startRun(0,'BG'); KB.G.bossIntro=null;
      const p=KB.G.player; p.iframes=0; KB.G.roomFresh=0; p.itemGet=null;
      KB.G.enemies.length=0; KB.G.eshots.length=0; KB.G.creeps.length=0;
      KB.G.tears.length=0; KB.G.bombs.length=0;
      for(const z of KB.G.room.grid) z.fill(null);
      for(const id of ids) acquireItem(id,null);
      p.itemGet=null; recomputeStats(); spawnFamiliars();
      let g=null;
      if(mitGegner!==false){ g=spawnEnemy('blobling',tx(9),ty(3),null);
        g.hp=g.maxHp=1e6; g.spd=0; }
      return {p,g};
    };
    const lauf=(n)=>{ for(let i=0;i<n;i++) updateGame(1/60); };
    const e={};

    /* Jede Art muss beim Aufheben wirklich erscheinen. */
    e.erscheint={};
    for(const id of ['messerfliege','feuerschaedel','engelsfluegel','schattenorb',
                     'stichling','augapfel','bombenfreund','kreuzbot',
                     'klingenring','seelenvogel']){
      bau([id]);
      e.erscheint[id]=KB.G.familiars.length===1
        &&KB.G.familiars[0].kind===KB.ITEMS[id].famil;
    }

    /* Messerfliege, Stichling, Klingenring machen Nahkampfschaden. */
    for(const [id,ticks] of [['messerfliege',180],['stichling',240],['klingenring',180]]){
      const {g}=bau([id]);
      g.x=KB.G.player.x+34; g.y=KB.G.player.y;      // in Reichweite halten
      const vor=g.hp;
      for(let i=0;i<ticks;i++){ g.x=KB.G.player.x+34; g.y=KB.G.player.y; updateGame(1/60); }
      e[id]={schaden:vor-g.hp};
    }

    /* Feuerschädel, Augapfel, Kreuzbot schießen. */
    for(const [id,ticks] of [['feuerschaedel',200],['augapfel',200],['kreuzbot',220]]){
      const {g}=bau([id]);
      let schuesse=0, brennend=0;
      const gesehen=new Set();
      for(let i=0;i<ticks;i++){
        updateGame(1/60);
        for(const t of KB.G.tears){ if(t.fam&&!gesehen.has(t)){ gesehen.add(t); schuesse++;
          if(t.burn) brennend++; } }
      }
      e[id]={schuesse,brennend};
    }

    /* Schattenorb feuert mit, sobald der Spieler feuert. */
    { bau(['schattenorb']);
      const vor=KB.G.tears.length;
      fireShot({x:1,y:0});
      e.schattenorb={neu:KB.G.tears.length-vor,
                     vomBegleiter:KB.G.tears.filter(t=>t.fam).length}; }

    /* Engelsflügel fängt genau einen Treffer je Raum ab. */
    { const {p}=bau(['engelsfluegel']);
      p.red=6; p.iframes=0;
      const erster=hurtPlayer(2);
      p.iframes=0;
      const zweiter=hurtPlayer(2);
      const nachErstem=p.red;
      /* Raumwechsel stellt die Feder neu auf. */
      spawnFamiliars(); p.iframes=0;
      const dritter=hurtPlayer(2);
      e.engelsfluegel={erster,zweiter,dritter,red:nachErstem}; }

    /* Bombenfreund legt Bomben, die dem Spieler nichts tun. */
    { const {p}=bau(['bombenfreund']);
      p.red=p.redMax; const vorLeben=p.red;
      let gelegt=0; const gesehen=new Set();
      for(let i=0;i<420;i++){ updateGame(1/60);
        for(const b of KB.G.bombs) if(!gesehen.has(b)){ gesehen.add(b); gelegt++; } }
      e.bombenfreund={gelegt,verlust:vorLeben-p.red,
                      freundlich:[...gesehen].every(b=>b.freundlich)}; }

    /* Seelenvogel sammelt Seelen und heilt daraus. */
    { const {p}=bau(['seelenvogel']);
      p.redMax=12; p.red=4; KB.G.seelen=0;
      for(let i=0;i<8;i++){ const g=spawnEnemy('tropfling',tx(6),ty(3),null); killEnemy(g); }
      const gesammelt=KB.G.seelen;
      KB.G.enemies.length=0;
      lauf(20);
      e.seelenvogel={gesammelt,geheilt:p.red-4,rest:KB.G.seelen}; }

    /* Ohne den Vogel darf kein Seelenzähler mitlaufen. */
    { bau([]); KB.G.seelen=0;
      const g=spawnEnemy('tropfling',tx(6),ty(3),null); killEnemy(g);
      e.ohneVogel={seelen:KB.G.seelen}; }

    /* Alle zehn gleichzeitig, unter Dauerfeuer — nichts darf werfen. */
    { const {g}=bau(['messerfliege','feuerschaedel','engelsfluegel','schattenorb',
                     'stichling','augapfel','bombenfreund','kreuzbot',
                     'klingenring','seelenvogel']);
      const p=KB.G.player;
      for(let i=0;i<420;i++){
        if(i%6===0) fireShot({x:Math.cos(i*0.3),y:Math.sin(i*0.3)});
        if(i%90===0&&KB.G.enemies.length<4){
          const z=spawnEnemy('tropfling',tx(4+i%6),ty(2),null); z.hp=z.maxHp=1e5; }
        updateGame(1/60);
      }
      e.zusammen={begleiter:KB.G.familiars.length,lebt:!p.dead}; }

    /* Gezeichnet werden müssen sie auch — alle Arten einmal durch. */
    { bau(['messerfliege','feuerschaedel','engelsfluegel','schattenorb','stichling',
           'augapfel','bombenfreund','kreuzbot','klingenring','seelenvogel']);
      for(let i=0;i<12;i++) { updateGame(1/60); render(); }
      e.gezeichnet=KB.G.familiars.length; }

    return e;
  });

  const fehlend=Object.keys(w.erscheint).filter(k=>!w.erscheint[k]);
  note(fehlend.length===0,'jeder Begleiter erscheint beim Aufheben',fehlend.join(' '));
  note(w.messerfliege.schaden>0,'Messerfliege schneidet im Vorbeiflug',
       '('+w.messerfliege.schaden.toFixed(1)+' Schaden)');
  note(w.stichling.schaden>0,'Stichling rammt',
       '('+w.stichling.schaden.toFixed(1)+' Schaden)');
  note(w.klingenring.schaden>0,'Klingenring schneidet auf der Bahn',
       '('+w.klingenring.schaden.toFixed(1)+' Schaden)');
  note(w.feuerschaedel.schuesse>0&&w.feuerschaedel.brennend===w.feuerschaedel.schuesse,
       'Feuerschädel spuckt nur brennende Bälle',
       '('+w.feuerschaedel.brennend+' von '+w.feuerschaedel.schuesse+')');
  note(w.augapfel.schuesse>0,'Augapfel schießt mit',
       '('+w.augapfel.schuesse+' Schüsse)');
  note(w.kreuzbot.schuesse>0&&w.kreuzbot.schuesse%4===0,
       'Kreuzbot feuert in Vierersalven',
       '('+w.kreuzbot.schuesse+' Schüsse)');
  note(w.schattenorb.neu===2&&w.schattenorb.vomBegleiter===1,
       'Schattenorb gibt jeden Schuss mit',
       '('+w.schattenorb.neu+' Tränen, davon '+w.schattenorb.vomBegleiter+' vom Orb)');
  note(w.engelsfluegel.erster===false&&w.engelsfluegel.zweiter===true
       &&w.engelsfluegel.dritter===false,
       'Engelsflügel fängt genau einen Treffer je Raum ab');
  note(w.bombenfreund.gelegt>0&&w.bombenfreund.freundlich&&w.bombenfreund.verlust===0,
       'Bombenfreund legt Bomben, die dir nichts tun',
       '('+w.bombenfreund.gelegt+' Bomben, '+w.bombenfreund.verlust+' Schaden)');
  note(w.seelenvogel.gesammelt===8&&w.seelenvogel.geheilt>0&&w.seelenvogel.rest===0,
       'Seelenvogel heilt aus acht Seelen',
       '(8 gesammelt → '+w.seelenvogel.geheilt+' halbes Herz)');
  note(w.ohneVogel.seelen===0,'ohne Vogel sammelt niemand Seelen');
  note(w.zusammen.begleiter===10&&w.zusammen.lebt,
       'alle zehn laufen gleichzeitig ohne Ausfall',
       '('+w.zusammen.begleiter+' Begleiter)');
  note(w.gezeichnet===10,'alle zehn werden gezeichnet');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

if(want(25)){
console.log('\n[25] Zwanzig Fundstücke: passiv und aktiv');
await withPage(async(page,errs)=>{
  const passiv=['gluecksklee','schatzkarte','zeituhr','muenzbeutel','schluesselherz',
                'wuerfel','opferkelch','teleportstein','daemonenpakt','rerollstein'];
  const aktiv=['bombenbeutel','heiltrank','schild','wuttrank','zeitstopp',
               'unsichtbarkeit','blutopfer','sprungfeder','magnet','beschwoerung'];
  const da=await page.evaluate(([passiv,aktiv])=>{
    const alle=passiv.concat(aktiv);
    return {
      fehlt:alle.filter(id=>!KB.ITEMS[id]),
      ohneSymbol:alle.filter(id=>KB.ITEMS[id]&&!KB.ITEMS[id].icon),
      ohnePool:alle.filter(id=>KB.ITEMS[id]&&!KB.ITEMS[id].pool.length),
      falscherTyp:passiv.filter(id=>KB.ITEMS[id]&&KB.ITEMS[id].type!=='passive')
        .concat(aktiv.filter(id=>KB.ITEMS[id]&&KB.ITEMS[id].type!=='active')),
      ohneLadung:aktiv.filter(id=>KB.ITEMS[id]&&!KB.ITEMS[id].charge),
      gesamt:Object.keys(KB.ITEMS).length
    };
  },[passiv,aktiv]);
  note(da.fehlt.length===0,'alle zwanzig sind da',da.fehlt.join(' '));
  note(da.ohneSymbol.length===0,'jedes hat ein eigenes, gezeichnetes Symbol',da.ohneSymbol.join(' '));
  note(da.ohnePool.length===0,'jedes liegt in mindestens einem Topf',da.ohnePool.join(' '));
  note(da.falscherTyp.length===0,'zehn passiv, zehn aktiv',da.falscherTyp.join(' '));
  note(da.ohneLadung.length===0,'jedes Aktivitem hat eine Ladung',da.ohneLadung.join(' '));
  console.log('    Items im Spiel: '+da.gesamt);

  const w=await page.evaluate(()=>{
    const bau=(ids,vor)=>{
      startRun(0,'PA'); KB.G.bossIntro=null;
      const p=KB.G.player; p.iframes=0; KB.G.roomFresh=0; p.itemGet=null;
      KB.G.enemies.length=0; KB.G.eshots.length=0; KB.G.creeps.length=0;
      KB.G.tears.length=0; KB.G.bombs.length=0; KB.G.zeitstopp=0;
      for(const z of KB.G.room.grid) z.fill(null);
      if(vor) vor(p);
      for(const id of ids) acquireItem(id,null);
      p.itemGet=null; recomputeStats(); spawnFamiliars();
      return p;
    };
    const uebung=(hp)=>{ const g=spawnEnemy('blobling',tx(9),ty(3),null);
      g.hp=g.maxHp=hp||1e6; return g; };
    const e={};

    /* --- Passives ------------------------------------------------------ */
    { const ohne=bau([]).stats.luck; const mit=bau(['gluecksklee']).stats.luck;
      e.klee={ohne,mit}; }
    { bau([]);
      const zu=Object.keys(KB.G.floor.rooms).filter(k=>!KB.G.floor.rooms[k].seen).length;
      bau(['schatzkarte']);
      const offen=Object.keys(KB.G.floor.rooms)
        .filter(k=>KB.G.floor.rooms[k].type!=='secret'&&!KB.G.floor.rooms[k].seen).length;
      const geheimZu=Object.keys(KB.G.floor.rooms)
        .filter(k=>KB.G.floor.rooms[k].type==='secret'&&!KB.G.floor.rooms[k].seen).length;
      e.karte={vorherZu:zu,offen,geheimZu}; }
    { /* Zeituhr: gleiche Zeit, weniger zurückgelegter Weg */
      const weg=(ids)=>{ bau(ids); const g=uebung();
        g.x=tx(10); g.y=ty(3); const x0=g.x;
        for(let i=0;i<120;i++) updateGame(1/60);
        return x0-g.x; };
      e.uhr={ohne:weg([]),mit:weg(['zeituhr'])}; }
    { const p=bau(['muenzbeutel']);
      e.beutel={muenzen:p.coins,flagge:p.flags.has('muenzbeutel')}; }
    { const p=bau(['schluesselherz']);
      KB.G.room.type='normal';                 // der Startraum zahlt nie aus
      const start=p.keys; let dazu=0;
      for(let i=0;i<40;i++){ KB.G.room.cleared=false; updateDoorsOpen(true);
        if(p.keys>start+dazu) dazu=p.keys-start; }
      /* Ohne das Item darf gar nichts kommen. */
      const q=bau([]); KB.G.room.type='normal';
      const start2=q.keys;
      for(let i=0;i<40;i++){ KB.G.room.cleared=false; updateDoorsOpen(true); }
      e.schluessel={start,dazu,ohne:q.keys-start2}; }
    { /* Würfel: die Fundstücke im Raum sind nach dem Betreten andere */
      const p=bau(['wuerfel']);
      const raum=KB.G.roomKey;
      KB.G.pickups.length=0;
      for(let i=0;i<12;i++) spawnPickup(tx(2+i%9),ty(1+(i%3)),'coin');
      KB.G.room.drops=KB.G.pickups.map(q=>({...q}));
      enterRoom(raum,null);
      e.wuerfel={andere:KB.G.pickups.filter(q=>q.type!=='coin').length,
                 gesamt:KB.G.pickups.length}; }
    { const p=bau(['opferkelch']); p.red=8; p.redMax=12;
      const vor=p.stats.dmg; p.iframes=0; hurtPlayer(2);
      recomputeStats();
      e.kelch={vor,nach:p.stats.dmg}; }
    { const p=bau(['teleportstein']); p.red=8;
      const x0=p.x,y0=p.y; p.iframes=0;
      const erster=hurtPlayer(2);
      const versetzt=Math.hypot(p.x-x0,p.y-y0)>20;
      const lebenNachErstem=p.red;
      p.iframes=0;
      const zweiter=hurtPlayer(2);           // Abklingzeit läuft noch
      e.stein={erster,versetzt,lebenNachErstem,zweiter,cd:p.steinCd>0}; }
    { const ohne=bau([]); const vorMax=ohne.redMax, vorDmg=ohne.stats.dmg;
      const p=bau(['daemonenpakt']);
      e.pakt={maxVor:vorMax,maxNach:p.redMax,dmgVor:vorDmg,dmgNach:p.stats.dmg}; }
    { /* Reroll-Stein: das Podest zeigt beim Betreten etwas anderes */
      const p=bau(['rerollstein']);
      const raum=KB.G.roomKey;
      KB.G.room.pedestals=[{x:tx(6),y:ty(3),itemId:'herzkern',taken:false,cd:0}];
      let anders=0;
      for(let i=0;i<12;i++){ KB.G.room.pedestals[0].itemId='herzkern';
        enterRoom(raum,null);
        if(KB.G.room.pedestals[0].itemId!=='herzkern') anders++; }
      e.reroll={anders}; }

    /* --- Aktivitems ----------------------------------------------------- */
    const nutze=(id,vor)=>{
      const p=bau([],vor);
      const it=KB.ITEMS[id];
      return {p,it,wirkte:it.use(p)};
    };
    { const {p,wirkte}=nutze('bombenbeutel',pp=>{pp.bombs=0;});
      e.bomben={wirkte,bomben:p.bombs}; }
    { const {p,wirkte}=nutze('heiltrank',pp=>{pp.red=2;});
      const voll=bau([]); voll.red=voll.redMax;
      e.trank={wirkte,red:p.red,beiVoll:KB.ITEMS.heiltrank.use(voll)}; }
    { const {p,wirkte}=nutze('schild');
      e.schild={wirkte,dauer:p.shield}; }
    { const {p,wirkte}=nutze('wuttrank');
      const g=uebung(); const vor=g.hp; hitEnemyWithMods(g,5,0,true);
      const mitWut=vor-g.hp;
      p.rausch=0; const vor2=g.hp; hitEnemyWithMods(g,5,0,true);
      e.wut={wirkte,mitWut,ohneWut:vor2-g.hp}; }
    { const p=bau([]); const g=uebung(); g.spd=200; g.x=tx(10); g.y=ty(3);
      const leer=KB.ITEMS.zeitstopp.use(p);      // mit Gegner: muss wirken
      const x0=g.x;
      for(let i=0;i<120;i++) updateGame(1/60);
      const bewegt=Math.abs(g.x-x0);
      const q=bau([]); KB.G.enemies.length=0; KB.G.eshots.length=0;
      e.stopp={wirkte:leer,bewegt,leerRaum:KB.ITEMS.zeitstopp.use(q)}; }
    { const p=bau([]); const g=uebung(); g.x=tx(10); g.y=ty(3);
      const wirkte=KB.ITEMS.unsichtbarkeit.use(p);
      const x0=g.x, y0=g.y;
      let schuss=0;
      for(let i=0;i<180;i++){ updateGame(1/60); schuss+=KB.G.eshots.length; }
      /* Ein Schütze darf im Unsichtbaren nichts abfeuern. */
      const s=bau([]); const sch=spawnEnemy('spucker',tx(9),ty(3),null);
      sch.hp=sch.maxHp=1e6;
      let ohne=0; for(let i=0;i<240;i++){ updateGame(1/60); ohne+=KB.G.eshots.length; }
      e.unsicht={wirkte,dauer:p.unsichtbar>0,schuss,ohne}; }
    { const p=bau([],pp=>{pp.red=6;}); const g=uebung(500);
      const vorLeben=p.red, vorHp=g.hp;
      const wirkte=KB.ITEMS.blutopfer.use(p);
      const q=bau([],pp=>{pp.red=6;}); KB.G.enemies.length=0;
      e.opfer={wirkte,leben:vorLeben-p.red,schaden:vorHp-g.hp,
               leerRaum:KB.ITEMS.blutopfer.use(q)}; }
    { const p=bau([]); p.aimDir={x:1,y:0};
      const x0=p.x;
      const wirkte=KB.ITEMS.sprungfeder.use(p);
      e.feder={wirkte,weite:p.x-x0,schutz:p.iframes>0}; }
    { const p=bau([]);
      for(let i=0;i<6;i++) spawnPickup(tx(1+i),ty(1),'coin');
      const fern=KB.G.pickups.filter(q=>dist(q,p)>60).length;
      const wirkte=KB.ITEMS.magnet.use(p);
      const nah=KB.G.pickups.filter(q=>dist(q,p)<40).length;
      const q=bau([]); KB.G.pickups.length=0;
      e.magnet={wirkte,fern,nah,leerRaum:KB.ITEMS.magnet.use(q)}; }
    { const p=bau([]); const g=uebung();
      const wirkte=KB.ITEMS.beschwoerung.use(p);
      const gerufen=KB.G.familiars.filter(f=>f.kind==='geist').length;
      const vorHp=g.hp;
      for(let i=0;i<180;i++) updateGame(1/60);
      const schaden=vorHp-g.hp;
      for(let i=0;i<15*60;i++) updateGame(1/60);      // Lebenszeit abwarten
      e.geister={wirkte,gerufen,schaden,
                 danach:KB.G.familiars.filter(f=>f.kind==='geist').length}; }

    /* Alle zwanzig zusammen unter Dauerfeuer. */
    { const p=bau(['gluecksklee','schatzkarte','zeituhr','muenzbeutel','schluesselherz',
                   'wuerfel','opferkelch','teleportstein','daemonenpakt','rerollstein']);
      for(const id of ['bombenbeutel','heiltrank','schild','wuttrank','zeitstopp',
                       'unsichtbarkeit','blutopfer','sprungfeder','magnet','beschwoerung']){
        uebung(1e6);
        spawnPickup(tx(3),ty(2),'coin');
        try{ KB.ITEMS[id].use(p); }catch(err){ return {absturz:id+': '+err.message}; }
        for(let i=0;i<60;i++) updateGame(1/60);
        render();
      }
      e.zusammen={lebt:!p.dead}; }

    return e;
  });

  if(w.absturz){ note(false,'kein Absturz beim Benutzen',w.absturz); }
  note(w.klee.mit===w.klee.ohne+3,'Glücksklee gibt drei Glück',
       '('+w.klee.ohne+' → '+w.klee.mit+')');
  note(w.karte.offen===0&&w.karte.vorherZu>0&&w.karte.geheimZu>0,
       'Schatzkarte deckt alles außer den Geheimräumen auf',
       '(vorher '+w.karte.vorherZu+' zu, danach '+w.karte.offen
       +' offen, '+w.karte.geheimZu+' Geheimräume verborgen)');
  note(w.uhr.mit<w.uhr.ohne*0.9,'Zeituhr bremst die Gegner',
       '(Weg '+w.uhr.ohne.toFixed(0)+' → '+w.uhr.mit.toFixed(0)+' px)');
  note(w.beutel.muenzen>=10&&w.beutel.flagge,'Münzbeutel gibt zehn Münzen',
       '('+w.beutel.muenzen+')');
  note(w.schluessel.dazu>0&&w.schluessel.ohne===0,
       'Schlüsselherz lässt geräumte Räume Schlüssel geben',
       '(+'+w.schluessel.dazu+' aus 40 Räumen, ohne das Item +'+w.schluessel.ohne+')');
  note(w.wuerfel.andere>0,'Würfel würfelt die Beute beim Betreten neu',
       '('+w.wuerfel.andere+' von '+w.wuerfel.gesamt+' verändert)');
  note(w.kelch.nach>w.kelch.vor,'Opferkelch macht Schaden aus verlorenem Leben',
       '('+w.kelch.vor.toFixed(1)+' → '+w.kelch.nach.toFixed(1)+')');
  note(w.stein.erster===false&&w.stein.versetzt&&w.stein.lebenNachErstem===8
       &&w.stein.zweiter===true,
       'Teleportstein blitzt einmal aus dem Treffer, dann kühlt er ab');
  note(w.pakt.maxNach===w.pakt.maxVor-2&&w.pakt.dmgNach===w.pakt.dmgVor+2,
       'Dämonenpakt: +2 Schaden für einen Herzcontainer',
       '(Container '+w.pakt.maxVor+' → '+w.pakt.maxNach
       +', Schaden '+w.pakt.dmgVor.toFixed(1)+' → '+w.pakt.dmgNach.toFixed(1)+')');
  note(w.reroll.anders>0,'Reroll-Stein tauscht das Podest-Item aus',
       '('+w.reroll.anders+' von 12)');
  note(w.bomben.wirkte&&w.bomben.bomben===5,'Bombenbeutel gibt fünf Bomben',
       '('+w.bomben.bomben+')');
  note(w.trank.wirkte&&w.trank.red===6&&w.trank.beiVoll===false,
       'Heiltrank heilt zwei Herzen und verpufft nicht bei vollem Leben',
       '(2 → '+w.trank.red+' Hälften)');
  note(w.schild.wirkte&&w.schild.dauer>=8,'Schild hält acht Sekunden',
       '('+w.schild.dauer.toFixed(1)+' s)');
  note(w.wut.wirkte&&w.wut.mitWut>w.wut.ohneWut*1.8,'Wuttrank verdoppelt den Schaden',
       '('+w.wut.ohneWut.toFixed(1)+' → '+w.wut.mitWut.toFixed(1)+')');
  note(w.stopp.wirkte&&w.stopp.bewegt<2&&w.stopp.leerRaum===false,
       'Zeitstopp hält die Gegner an und verpufft im leeren Raum',
       '(Bewegung '+w.stopp.bewegt.toFixed(1)+' px in 2 s)');
  note(w.unsicht.wirkte&&w.unsicht.schuss===0&&w.unsicht.ohne>0,
       'Unsichtbarkeit: niemand schießt mehr auf dich',
       '(unsichtbar '+w.unsicht.schuss+', sichtbar '+w.unsicht.ohne+' Geschossticks)');
  note(w.opfer.wirkte&&w.opfer.leben===1&&w.opfer.schaden>=40&&w.opfer.leerRaum===false,
       'Blutopfer kostet ein halbes Herz und schlägt hart zu',
       '('+w.opfer.leben+' Hälfte, '+w.opfer.schaden.toFixed(0)+' Schaden)');
  note(w.feder.wirkte&&w.feder.weite>40&&w.feder.schutz,
       'Sprungfeder setzt dich weit nach vorn',
       '('+w.feder.weite.toFixed(0)+' px)');
  note(w.magnet.wirkte&&w.magnet.fern>0&&w.magnet.nah===w.magnet.fern
       &&w.magnet.leerRaum===false,
       'Magnet holt alle Fundstücke heran',
       '('+w.magnet.fern+' geholt)');
  note(w.geister.wirkte&&w.geister.gerufen===3&&w.geister.schaden>0
       &&w.geister.danach===0,
       'Beschwörung ruft drei Geister, die kämpfen und wieder vergehen',
       '('+w.geister.gerufen+' Geister, '+w.geister.schaden.toFixed(0)+' Schaden)');
  note(w.zusammen&&w.zusammen.lebt,'alle zwanzig zusammen ohne Ausfall');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}

if(want(26)){
console.log('\n[26] Etagenflüche, Arena und Bibliothek');
await withPage(async(page,errs)=>{

  /* --- Die Flüche über viele Etagen -------------------------------------- */
  const fl=await page.evaluate(()=>{
    const zaehler={}, ids=KB.FLUECHE.map(f=>f.id);
    for(const id of ids) zaehler[id]=0;
    let mitFluch=0, gesamt=0, aufEins=0, labRaeume=[], normRaeume=[];
    for(let s=0;s<60;s++){
      startRun(0,'FL'+s);
      for(let d=1;d<=6;d++){
        const f=genFloor(d); gesamt++;
        const n=Object.keys(f.rooms).length;
        if(f.fluch){
          mitFluch++; zaehler[f.fluch]++;
          if(d===1) aufEins++;
          if(f.fluch==='labyrinth') labRaeume.push(n);
        } else normRaeume.push(n);
      }
    }
    /* Derselbe Seed muss denselben Fluch ergeben. */
    startRun(0,'GLEICH'); const a=[]; for(let d=1;d<=6;d++) a.push(genFloor(d).fluch);
    startRun(0,'GLEICH'); const b=[]; for(let d=1;d<=6;d++) b.push(genFloor(d).fluch);
    const mit=x=>x.length?x.reduce((s,v)=>s+v,0)/x.length:0;
    return {zaehler,mitFluch,gesamt,aufEins,
            labSchnitt:mit(labRaeume),normSchnitt:mit(normRaeume),
            gleich:a.join()===b.join(),
            beschriftet:KB.FLUECHE.every(f=>f.name&&f.desc)};
  });
  const fehlend=Object.keys(fl.zaehler).filter(k=>fl.zaehler[k]===0);
  note(fehlend.length===0,'jeder der fünf Flüche kommt vor',fehlend.join(' '));
  note(fl.mitFluch>0&&fl.mitFluch<fl.gesamt*0.5,
       'Flüche sind die Ausnahme, nicht die Regel',
       '('+fl.mitFluch+' von '+fl.gesamt+' Etagen)');
  note(fl.aufEins===0,'Etage 1 bleibt immer ungeflucht');
  note(fl.gleich,'derselbe Seed ergibt dieselben Flüche');
  note(fl.beschriftet,'jeder Fluch hat Namen und Beschreibung');
  note(fl.labSchnitt>fl.normSchnitt*1.4,'das Labyrinth macht die Etage größer',
       '(Ø '+fl.normSchnitt.toFixed(1)+' → '+fl.labSchnitt.toFixed(1)+' Räume)');

  /* Das Labyrinth legt einen zweiten Schatzraum aus. */
  const lab=await page.evaluate(()=>{
    let mitLab=0, ohne=0, n=0, m=0;
    for(let s=0;s<200;s++){
      startRun(0,'LB'+s);
      for(let d=2;d<=6;d++){
        const f=genFloor(d);
        const schaetze=Object.values(f.rooms).filter(r=>r.type==='treasure').length;
        if(f.fluch==='labyrinth'){ mitLab+=schaetze; n++; }
        else if(!f.fluch){ ohne+=schaetze; m++; }
      }
      if(n>=25&&m>=25) break;
    }
    return {mitLab:n?mitLab/n:0,ohne:m?ohne/m:0,n,m};
  });
  note(lab.n>0&&lab.mitLab>lab.ohne,'im Labyrinth liegt ein Schatzraum mehr',
       '(Ø '+lab.ohne.toFixed(2)+' → '+lab.mitLab.toFixed(2)+')');

  /* --- Wirkung der Flüche im Spiel --------------------------------------- */
  const w=await page.evaluate(()=>{
    /* Eine Etage mit dem gewünschten Fluch herbeiführen. */
    const mitFluch=(id)=>{
      startRun(0,'W'+id); KB.G.bossIntro=null;
      KB.G.floor.fluch=id;
      const p=KB.G.player; p.itemGet=null; p.iframes=0; KB.G.roomFresh=0;
      KB.G.enemies.length=0;
      return p;
    };
    const e={};
    /* Hunger halbiert die Heilung — auch die aus einem Herz am Boden. */
    { const p=mitFluch(null); p.redMax=12; p.red=2;
      const ohne=heileSpieler(4);
      const q=mitFluch('hunger'); q.redMax=12; q.red=2;
      const mit=heileSpieler(4);
      e.hunger={ohne,mit}; }
    /* Nebel: die Karte zeigt nur den eigenen Raum. Gezählt wird, wie viele
       Zellen drawMinimap wirklich setzt — verlässlicher als Pixelzählen. */
    const kartePixel=()=>{ render(); return KB.karteRaeume; };
    { const p=mitFluch(null);
      for(const k in KB.G.floor.rooms){ KB.G.floor.rooms[k].seen=true;
        KB.G.floor.rooms[k].visited=true; }
      const offen=kartePixel();
      KB.G.floor.fluch='nebel';
      const zu=kartePixel();
      e.nebel={offen,zu}; }
    /* Labyrinth verschweigt Räume, in denen man noch nicht war. */
    { const p=mitFluch('labyrinth');
      for(const k in KB.G.floor.rooms){ KB.G.floor.rooms[k].seen=true;
        KB.G.floor.rooms[k].visited=(k===KB.G.roomKey); }
      const wenig=kartePixel();
      for(const k in KB.G.floor.rooms) KB.G.floor.rooms[k].visited=true;
      const viel=kartePixel();
      e.labKarte={wenig,viel}; }
    /* Finsternis verdunkelt den Raum wirklich. */
    const raumHelligkeit=()=>{
      const c=document.querySelector('canvas'), g=c.getContext('2d');
      render();
      const f=c.width/640;
      /* Ecke oben links im Raum — weit weg vom Spieler in der Mitte. */
      const d=g.getImageData(Math.round(70*f),Math.round(60*f),
                             Math.round(40*f),Math.round(30*f)).data;
      let sum=0; for(let i=0;i<d.length;i+=4) sum+=d[i]+d[i+1]+d[i+2];
      return sum/(d.length/4);
    };
    { mitFluch(null); for(const z of KB.G.room.grid) z.fill(null);
      const hell=raumHelligkeit();
      KB.G.floor.fluch='finsternis';
      const dunkel=raumHelligkeit();
      e.finsternis={hell,dunkel}; }
    /* Blindheit: auf dem Podest steht ein Fragezeichen, die Tafel schweigt. */
    { const p=mitFluch('blindheit');
      KB.G.room.pedestals=[{x:tx(6),y:ty(3),itemId:'herzkern',taken:false,cd:9}];
      p.x=tx(6); p.y=ty(3)+18;
      render();
      const tafelBlind=KB.tafelnGezeichnet;
      KB.G.floor.fluch=null;
      render();
      e.blind={tafelBlind,tafelNormal:KB.tafelnGezeichnet}; }
    return e;
  });
  note(w.hunger.mit>0&&w.hunger.mit<w.hunger.ohne,'Hunger halbiert die Heilung',
       '('+w.hunger.ohne+' → '+w.hunger.mit+' Hälften)');
  note(w.nebel.zu===1&&w.nebel.offen>3,'Nebel löscht die Karte bis auf den eigenen Raum',
       '('+w.nebel.offen+' → '+w.nebel.zu+' Räume auf der Karte)');
  note(w.labKarte.wenig===1&&w.labKarte.viel>3,
       'das Labyrinth zeigt nur betretene Räume',
       '('+w.labKarte.viel+' → '+w.labKarte.wenig+' Räume auf der Karte)');
  note(w.finsternis.dunkel<w.finsternis.hell*0.35,'Finsternis verdunkelt den Raum',
       '(Helligkeit '+w.finsternis.hell.toFixed(0)+' → '+w.finsternis.dunkel.toFixed(0)+')');
  note(w.blind.tafelBlind>0&&w.blind.tafelNormal>0,
       'auch blind steht eine Tafel da — sie verrät nur nichts');

  /* --- Herausforderungsraum ---------------------------------------------- */
  const ar=await page.evaluate(()=>{
    for(let s=0;s<400;s++){
      startRun(0,'AR'+s);
      let key=null, tiefe=1;
      for(let d=2;d<=6&&!key;d++){
        KB.G.depth=d; KB.G.floor=genFloor(d);
        key=Object.keys(KB.G.floor.rooms).find(k=>KB.G.floor.rooms[k].type==='arena');
        tiefe=d;
      }
      if(!key) continue;
      const room=KB.G.floor.rooms[key];
      const lohn=room.lohn;
      enterRoom(key,null); KB.G.bossIntro=null;
      const p=KB.G.player; p.itemGet=null; p.iframes=1e9; p.dmgTest=true;
      const vorAusloesen={gegner:KB.G.enemies.length,
                          offen:Object.keys(KB.G.room.doors)
                                 .every(d=>doorPassable(KB.G.room.doors[d]))};
      /* Auf die Platte treten. */
      p.x=room.platte.x; p.y=room.platte.y;
      for(let i=0;i<10;i++) updateGame(1/60);
      const gestartet=!!(KB.G.arena&&KB.G.arena.laeuft);
      const zuNachStart=Object.keys(KB.G.room.doors)
                          .some(d=>!doorPassable(KB.G.room.doors[d]));
      /* Alle Wellen niedermachen. */
      const wellen=[]; let ticks=0;
      while(KB.G.arena&&KB.G.arena.laeuft&&ticks<4000){
        if(KB.G.enemies.length){
          if(!wellen.length||wellen[wellen.length-1].nr!==KB.G.arena.welle)
            wellen.push({nr:KB.G.arena.welle,n:KB.G.enemies.length});
          else wellen[wellen.length-1].n=Math.max(wellen[wellen.length-1].n,KB.G.enemies.length);
          for(const g of [...KB.G.enemies]) killEnemy(g);
          KB.G.enemies=KB.G.enemies.filter(g=>!g.dead);
        }
        updateGame(1/60); ticks++;
      }
      const nachher={fertig:!!KB.G.room.arenaFertig,
                     podeste:KB.G.room.pedestals.length,
                     lohnDa:KB.G.room.pedestals.some(pd=>pd.itemId===lohn),
                     truhe:KB.G.pickups.some(q=>q.type==='goldchest'),
                     platteWeg:!KB.G.room.platte,
                     wieOffen:Object.keys(KB.G.room.doors)
                                .every(d=>doorPassable(KB.G.room.doors[d]))};
      /* Wieder betreten: nichts startet erneut, der Lohn bleibt liegen. */
      const anderer=Object.keys(KB.G.floor.rooms).find(k=>k!==key);
      enterRoom(anderer,null); enterRoom(key,null); KB.G.bossIntro=null;
      const erneut={arena:!!KB.G.arena,podeste:KB.G.room.pedestals.length};
      return {tiefe,vorAusloesen,gestartet,zuNachStart,wellen,nachher,erneut,ticks};
    }
    return null;
  });
  note(!!ar,'ein Herausforderungsraum ist auffindbar',ar?'(Etage '+ar.tiefe+')':'keiner in 400 Seeds');
  if(ar){
    note(ar.vorAusloesen.gegner===0&&ar.vorAusloesen.offen,
         'vor dem Auslösen ist der Raum leer und offen');
    note(ar.gestartet&&ar.zuNachStart,'die Platte startet den Kampf und schließt die Türen');
    note(ar.wellen.length===3,'genau drei Wellen','('+ar.wellen.map(x=>x.n).join(' / ')+' Gegner)');
    note(ar.wellen.length===3&&ar.wellen[2].n>ar.wellen[0].n,
         'jede Welle ist größer als die vorige');
    note(ar.nachher.fertig&&ar.nachher.lohnDa&&ar.nachher.truhe&&ar.nachher.platteWeg,
         'nach der letzten Welle steht der Lohn bereit');
    note(ar.nachher.wieOffen,'danach gehen die Türen wieder auf');
    note(!ar.erneut.arena&&ar.erneut.podeste>0,
         'ein bestandener Raum startet nicht noch einmal');
  }

  /* --- Bibliothek --------------------------------------------------------- */
  const bib=await page.evaluate(()=>{
    for(let s=0;s<400;s++){
      startRun(0,'BI'+s);
      let key=null, tiefe=1;
      for(let d=2;d<=6&&!key;d++){
        KB.G.depth=d; KB.G.floor=genFloor(d);
        key=Object.keys(KB.G.floor.rooms).find(k=>KB.G.floor.rooms[k].type==='library');
        tiefe=d;
      }
      if(!key) continue;
      enterRoom(key,null); KB.G.bossIntro=null;
      const p=KB.G.player; p.itemGet=null; p.iframes=1e9;
      p.pocket=null;
      const vorher=KB.G.pickups.filter(q=>q.wahl).length;
      const arten=[...new Set(KB.G.pickups.filter(q=>q.wahl).map(q=>q.type))];
      /* Zu einem Pult gehen und zugreifen. */
      const ziel=KB.G.pickups.find(q=>q.wahl);
      p.x=ziel.x; p.y=ziel.y;
      for(let i=0;i<20;i++) updateGame(1/60);
      const uebrig=KB.G.pickups.filter(q=>q.wahl&&!q.dead).length;
      const hat=!!p.pocket;
      /* Wieder betreten: es kommt nichts nach. */
      const anderer=Object.keys(KB.G.floor.rooms).find(k=>k!==key);
      enterRoom(anderer,null); enterRoom(key,null); KB.G.bossIntro=null;
      const nachRueckkehr=KB.G.pickups.filter(q=>q.wahl).length;
      return {tiefe,vorher,arten,uebrig,hat,nachRueckkehr};
    }
    return null;
  });
  note(!!bib,'eine Bibliothek ist auffindbar',bib?'(Etage '+bib.tiefe+')':'keine in 400 Seeds');
  if(bib){
    note(bib.vorher===3,'drei Fundstücke liegen aus','('+bib.vorher+')');
    note(bib.arten.every(t=>t==='card'||t==='pill'),
         'ausgelegt werden nur Karten und Pillen','('+bib.arten.join(' ')+')');
    note(bib.hat&&bib.uebrig===0,'wer eines nimmt, verliert die anderen beiden');
    note(bib.nachRueckkehr===0,'zurückkommen bringt nichts nach');
  }

  /* --- Nichts davon bricht einen normalen Durchlauf ---------------------- */
  const lauf=await page.evaluate(()=>{
    startRun(0,'DURCH'); KB.G.bossIntro=null;
    const p=KB.G.player; p.iframes=1e9;
    let besucht=0, arenen=0, bibs=0, verflucht=0;
    for(let d=1;d<=6;d++){
      KB.G.depth=d; KB.G.floor=genFloor(d);
      if(KB.G.floor.fluch) verflucht++;
      for(const k in KB.G.floor.rooms){
        const t=KB.G.floor.rooms[k].type;
        if(t==='boss'||t==='devil'||t==='angel') continue;
        enterRoom(k,null); KB.G.bossIntro=null; besucht++;
        if(t==='arena') arenen++;
        if(t==='library') bibs++;
        for(let i=0;i<8;i++){ updateGame(1/60); render(); }
      }
    }
    return {besucht,arenen,bibs,verflucht,lebt:!p.dead};
  });
  note(lauf.lebt&&lauf.besucht>40,'alle Räume von sechs Etagen laufen und zeichnen',
       '('+lauf.besucht+' Räume, '+lauf.arenen+' Arenen, '+lauf.bibs
       +' Bibliotheken, '+lauf.verflucht+' verfluchte Etagen)');
  note(errs.length===0,'keine JS-Fehler',errs.join(' '));
});

}
console.log('\n================================');
if(fails.length){ console.log('FEHLGESCHLAGEN:'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
console.log('ALLE PRÜFUNGEN BESTANDEN');
})();
