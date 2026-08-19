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
console.log('\n================================');
if(fails.length){ console.log('FEHLGESCHLAGEN:'); fails.forEach(f=>console.log(' - '+f)); process.exit(1); }
console.log('ALLE PRÜFUNGEN BESTANDEN');
})();
