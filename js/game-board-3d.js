/**
 * Samostatný prémiový Three.js renderer.
 * Scéna se skládá výhradně z čistých herních dat; SVG rendereru se nedotýká.
 * Souřadnice herního modelu (720 × 720) převádíme do prostorové scény.
 */
const UNIT = 1 / 42;
let threePromise;
function loadThree() {
    if (!threePromise) threePromise = Promise.all([
        import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js'),
        import('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js')
    ]).then(([THREE, controls]) => ({ THREE, OrbitControls: controls.OrbitControls }))
      .catch(error => { threePromise = null; throw error; });
    return threePromise;
}
function mat(T,color,options={}) {
    return new T.MeshStandardMaterial({color,roughness:options.roughness??.48,metalness:options.metalness??.12,
        transparent:options.opacity!=null&&options.opacity<1,opacity:options.opacity??1});
}
function add(T,parent,geometry,material,x,y,z,shadows=true) {
    const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);
    mesh.castShadow=shadows;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function pawn(T,color,size,playerId,pieceId,selectable) {
    const group=new T.Group(),scale=Math.max(10,size)/15;
    const plastic=new T.MeshPhysicalMaterial({color,roughness:.22,metalness:.04,clearcoat:.8,clearcoatRoughness:.17});
    const dark=mat(T,0x18221e,{roughness:.3,metalness:.48}),gold=mat(T,0xd4b36b,{roughness:.24,metalness:.72});
    add(T,group,new T.CylinderGeometry(.34*scale,.38*scale,.13*scale,40),dark,0,.105*scale,0);
    add(T,group,new T.CylinderGeometry(.335*scale,.35*scale,.035*scale,40),gold,0,.18*scale,0);
    const profile=[[0,.19],[.29,.19],[.34,.25],[.31,.34],[.23,.47],[.17,.66],[.18,.79],[.23,.86],[0,.86]]
        .map(([x,y])=>new T.Vector2(x*scale,y*scale));
    const body=new T.Mesh(new T.LatheGeometry(profile,40),plastic);body.castShadow=true;body.receiveShadow=true;group.add(body);
    add(T,group,new T.CylinderGeometry(.17*scale,.20*scale,.13*scale,32),plastic,0,.88*scale,0);
    add(T,group,new T.SphereGeometry(.255*scale,40,32),plastic,0,1.08*scale,0);
    const shine=add(T,group,new T.SphereGeometry(.035*scale,12,10),new T.MeshBasicMaterial({color:0xffffff}),-.085*scale,1.17*scale,.22*scale,false);
    shine.scale.set(1.2,.7,.4);group.userData={playerId,pieceId,selectable};
    group.traverse(object=>{object.userData.pawnRoot=group});return group;
}
function createBoardShape(T,data) {
    const shape=new T.Shape(),n=data.slotCount;
    if(data.style==='polygon'){
        const radius=data.boardRadius*UNIT;
        for(let i=0;i<n;i++){const a=(-90+(i+.5)*360/n)*Math.PI/180,x=Math.cos(a)*radius,z=Math.sin(a)*radius;
            if(i===0)shape.moveTo(x,z);else shape.lineTo(x,z)}
    }else{
        const outer=342*UNIT,inner=(n===4?72:n===6?84:86)*UNIT;
        for(let i=0;i<n*2;i++){const a=(-90+i*180/n)*Math.PI/180,r=i%2===0?outer:inner,x=Math.cos(a)*r,z=Math.sin(a)*r;
            if(i===0)shape.moveTo(x,z);else shape.lineTo(x,z)}
    }
    shape.closePath();return new T.ShapeGeometry(shape,3);
}
function buildScene(T,scene,data) {
    const board=new T.Group();scene.add(board);
    const dark=mat(T,0x18221e,{roughness:.3,metalness:.48}),gold=mat(T,0xd4b36b,{roughness:.24,metalness:.72});
    const felt=mat(T,0x284337,{roughness:.82}),edge=mat(T,0x9caa9f,{roughness:.38,metalness:.2});
    const radius=data.boardRadius*UNIT;
    add(T,board,new T.CylinderGeometry(radius,radius+.20,.48,128),dark,0,-.28,0);
    add(T,board,new T.CylinderGeometry(radius-.08,radius-.02,.12,128),gold,0,-.015,0);
    const top=new T.Mesh(new T.ExtrudeGeometry(createBoardShape(T,data),{depth:.28,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.12,bevelThickness:.08}),felt);
    top.rotation.x=-Math.PI/2;top.position.y=.02;top.castShadow=true;top.receiveShadow=true;board.add(top);
    const rim=add(T,board,new T.TorusGeometry(radius-.13,.055,12,160),gold,0,.15,0);rim.rotation.x=Math.PI/2;
    data.track.forEach(cell=>{
        const x=cell.x*UNIT,z=cell.z*UNIT,r=cell.radius*UNIT;
        add(T,board,new T.CylinderGeometry(r+.045,r+.05,.105,32),edge,x,.27,z,false);
        add(T,board,new T.CylinderGeometry(r,r+.02,.10,32),mat(T,cell.start?cell.color:0xd9d3c5,
            {roughness:cell.start?.38:.55,opacity:cell.start?1:Math.max(.42,cell.opacity)}),x,.34,z,false);
        if(cell.start)add(T,board,new T.CylinderGeometry(r*.30,r*.30,.018,24),mat(T,0xffffff,{roughness:.25}),x,.405,z,false);
    });
    data.lanes.forEach(lane=>lane.cells.forEach(cell=>{
        const x=cell.x*UNIT,z=cell.z*UNIT,r=cell.radius*UNIT;
        add(T,board,new T.CylinderGeometry(r+.035,r+.04,.075,32),gold,x,.30,z,false);
        add(T,board,new T.CylinderGeometry(r,r+.01,.08,32),mat(T,lane.color,{roughness:.48,opacity:lane.occupied?.92:.30}),x,.36,z,false);
    }));
    data.bases.forEach(base=>{
        const x=base.x*UNIT,z=base.z*UNIT,r=base.radius*UNIT;
        add(T,board,new T.CylinderGeometry(r,r+.08,.10,64),dark,x,.25,z,false);
        const ring=add(T,board,new T.TorusGeometry(r*.91,.035,10,64),mat(T,base.color,{roughness:.3,metalness:.25}),x,.32,z,false);
        ring.rotation.x=Math.PI/2;
        add(T,board,new T.CylinderGeometry(r*.78,r*.78,.018,48),mat(T,base.color,{roughness:.55,opacity:.75}),x,.315,z,false);
    });
    add(T,board,new T.CylinderGeometry(.78,.84,.16,64),dark,0,.30,0);
    const medallion=new T.Mesh(new T.TorusGeometry(.66,.045,12,64),gold);medallion.rotation.x=Math.PI/2;medallion.position.y=.40;board.add(medallion);
    add(T,board,new T.CylinderGeometry(.59,.59,.035,64),mat(T,0x385545,{roughness:.5}),0,.40,0);
    const pickables=[],addPawn=item=>{
        const piece=pawn(T,item.color,item.radius||15,item.playerId,item.pieceId,item.selectable);
        piece.position.set(item.x*UNIT,.34,item.z*UNIT);piece.rotation.y=-Math.PI/2;
        if(item.selectable)piece.traverse(child=>{if(child.isMesh)pickables.push(child)});board.add(piece);
    };
    data.bases.forEach(base=>base.pieces.forEach(addPawn));data.pieces.forEach(addPawn);
    return {board,pickables};
}
export async function render3DBoard(stage,data) {
    if(!stage)return;
    try{
        const {THREE:T,OrbitControls}=await loadThree();if(!stage.isConnected)return;
        const maxRadius=data.track.reduce((m,p)=>Math.max(m,Math.hypot(p.x,p.z)),0);
        const boardRadius=(data.style==='polygon'?maxRadius+34:360)*UNIT;data.boardRadius=boardRadius/UNIT;
        let renderer=stage._renderer;
        if(!renderer){
            stage._scene=new T.Scene();stage._scene.background=new T.Color(0x18251e);
            stage._camera=new T.PerspectiveCamera(34,1,.1,100);stage._camera.position.set(0,boardRadius*3.5,.01);
            renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
            renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.7));renderer.shadowMap.enabled=true;
            renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.outputColorSpace=T.SRGBColorSpace;
            renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
            stage.appendChild(renderer.domElement);stage._renderer=renderer;
            stage._scene.add(new T.HemisphereLight(0xe8f4ff,0x28352c,2.1));
            const key=new T.DirectionalLight(0xffefd9,3.4);key.position.set(-8,15,10);key.castShadow=true;
            key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-12;key.shadow.camera.right=12;
            key.shadow.camera.top=12;key.shadow.camera.bottom=-12;key.shadow.bias=-.0002;stage._scene.add(key);
            const fill=new T.DirectionalLight(0x9bbcff,1.5);fill.position.set(10,8,-10);stage._scene.add(fill);
            stage._controls=new OrbitControls(stage._camera,renderer.domElement);stage._controls.target.set(0,.1,0);
            stage._controls.enableDamping=true;stage._controls.dampingFactor=.07;
            stage._controls.minDistance=boardRadius*1.25;stage._controls.maxDistance=boardRadius*4;
            stage._controls.maxPolarAngle=Math.PI*.49;stage._controls.update();
            stage._raycaster=new T.Raycaster();stage._pointer=new T.Vector2();
            stage._animation=()=>{if(!stage.isConnected)return;stage._raf=requestAnimationFrame(stage._animation);
                stage._controls.update();stage._renderer.render(stage._scene,stage._camera)};
            stage._animation();stage._resizeObserver=new ResizeObserver(()=>resize(stage));stage._resizeObserver.observe(stage);
            stage._onPointerDown=e=>{stage._downPoint={x:e.clientX,y:e.clientY}};
            stage._onPointerUp=e=>{
                if(!stage._downPoint||Math.hypot(e.clientX-stage._downPoint.x,e.clientY-stage._downPoint.y)>6)return;
                const rect=renderer.domElement.getBoundingClientRect();
                stage._pointer.x=((e.clientX-rect.left)/rect.width)*2-1;stage._pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
                stage._raycaster.setFromCamera(stage._pointer,stage._camera);
                const hit=stage._raycaster.intersectObjects(stage._pickables||[],false)[0];
                const detail=hit?.object.userData.pawnRoot?.userData;
                if(detail?.selectable)stage.dispatchEvent(new CustomEvent('boardpiececlick',{bubbles:true,detail:{playerId:detail.playerId,pieceId:detail.pieceId}}));
                stage._downPoint=null;
            };
            renderer.domElement.addEventListener('pointerdown',stage._onPointerDown);
            renderer.domElement.addEventListener('pointerup',stage._onPointerUp);stage._boardRadius=boardRadius;
        }else if(stage._boardRadius!==boardRadius){
            stage._camera.position.set(0,boardRadius*3.1,.01);stage._controls.target.set(0,.1,0);
            stage._controls.minDistance=boardRadius*1.25;stage._controls.maxDistance=boardRadius*4;
            stage._controls.update();stage._boardRadius=boardRadius;
        }
        if(stage._board){stage._scene.remove(stage._board);stage._board.traverse(object=>{
            object.geometry?.dispose();if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());else object.material?.dispose()})}
        const built=buildScene(T,stage._scene,data);stage._board=built.board;stage._pickables=built.pickables;resize(stage);
    }catch(error){console.error('3D desku se nepodařilo vykreslit:',error);stage.textContent='3D desku se nepodařilo načíst. Přepni na 2D SVG.'}
}
function resize(stage){
    const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);
    stage._renderer.setSize(width,height,false);stage._camera.aspect=width/height;stage._camera.updateProjectionMatrix();
}
export function dispose3DBoard(stage){
    if(!stage)return;if(stage._raf)cancelAnimationFrame(stage._raf);stage._resizeObserver?.disconnect();
    if(stage._onPointerDown)stage._renderer?.domElement.removeEventListener('pointerdown',stage._onPointerDown);
    if(stage._onPointerUp)stage._renderer?.domElement.removeEventListener('pointerup',stage._onPointerUp);
    stage._controls?.dispose();stage._board?.traverse(object=>{
        object.geometry?.dispose();if(Array.isArray(object.material))object.material.forEach(item=>item.dispose());else object.material?.dispose()});
    stage._renderer?.dispose();stage._renderer?.domElement.remove();
}
