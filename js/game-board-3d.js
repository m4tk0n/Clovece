/**
 * Samostatný Three.js renderer herní desky.
 * Vstupem je čistý model z herního stavu; tento modul nikdy nečte SVG ani
 * jiné DOM vykreslení. Kliknutí na figurku vrací pouze její herní ID.
 */
let threePromise;
function loadThree() {
    if (!threePromise) threePromise = Promise.all([
        import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js'),
        import('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js')
    ]).then(([THREE, controls]) => ({ THREE, OrbitControls: controls.OrbitControls }))
      .catch(error => { threePromise = null; throw error; });
    return threePromise;
}

function material(T, color, options = {}) {
    return new T.MeshStandardMaterial({
        color: color || '#c6a96b',
        roughness: options.roughness ?? .48,
        metalness: options.metalness ?? .12,
        transparent: options.opacity != null && options.opacity < 1,
        opacity: options.opacity ?? 1
    });
}
function add(T, parent, geometry, mat, x, y, z, shadows = true) {
    const mesh = new T.Mesh(geometry, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadows;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
}
function pawn(T, color, size, playerId, pieceId, selectable) {
    const group = new T.Group();
    const scale = Math.max(10, size) / 15;
    const plastic = material(T, color, { roughness: .2, metalness: .04 });
    const dark = material(T, 0x17211d, { roughness: .32, metalness: .35 });
    const gold = material(T, 0xc6a96b, { roughness: .24, metalness: .72 });
    add(T, group, new T.CylinderGeometry(.78*scale,.86*scale,.19*scale,36), dark, 0,.095*scale,0);
    add(T, group, new T.CylinderGeometry(.75*scale,.78*scale,.045*scale,36), gold, 0,.205*scale,0);
    const profile = [[0,.20],[.68,.20],[.76,.27],[.69,.40],[.49,.57],[.35,.83],[.37,1.03],[.48,1.13],[0,1.13]]
        .map(([x,y]) => new T.Vector2(x*scale,y*scale));
    const body = new T.Mesh(new T.LatheGeometry(profile,36), plastic);
    body.castShadow = true; body.receiveShadow = true; group.add(body);
    add(T,group,new T.CylinderGeometry(.34*scale,.39*scale,.15*scale,28),plastic,0,1.15*scale,0);
    add(T,group,new T.SphereGeometry(.39*scale,32,24),plastic,0,1.40*scale,0);
    const shine = add(T,group,new T.SphereGeometry(.055*scale,12,10),
        new T.MeshBasicMaterial({color:0xffffff}),-.13*scale,1.51*scale,.30*scale,false);
    shine.scale.set(1.2,.7,.45);
    group.userData = { playerId, pieceId, selectable };
    group.traverse(object => { object.userData.pawnRoot = group; });
    return group;
}
function createBoardShape(T, data) {
    const shape = new T.Shape();
    const n = data.slotCount;
    if (data.style === 'polygon') {
        const radius = data.track.reduce((max, p) => Math.max(max, Math.hypot(p.x,p.z)), 0) + 22;
        for (let i=0;i<n;i++) {
            const angle = (-90 + (i + .5) * 360/n) * Math.PI/180;
            const x = Math.cos(angle)*radius, z = Math.sin(angle)*radius;
            if (i===0) shape.moveTo(x,z); else shape.lineTo(x,z);
        }
    } else {
        const outer = 342;
        const inner = n===4 ? 52 : n===6 ? 72 : 88;
        for (let i=0;i<n*2;i++) {
            const angle = (-90 + i*180/n) * Math.PI/180;
            const radius = i%2===0 ? outer : inner;
            const x=Math.cos(angle)*radius,z=Math.sin(angle)*radius;
            if(i===0)shape.moveTo(x,z);else shape.lineTo(x,z);
        }
    }
    shape.closePath();
    return new T.ShapeGeometry(shape, 2);
}
function buildScene(T, scene, data) {
    const board = new T.Group();
    scene.add(board);
    const dark=material(T,0x17221d,{roughness:.3,metalness:.4});
    const felt=material(T,0x294638,{roughness:.88});
    const gold=material(T,0xc6a96b,{roughness:.24,metalness:.72});
    const edge=material(T,0x9ba99f,{roughness:.38,metalness:.2});

    const maxTrackRadius = data.track.reduce((max, cell) => Math.max(max, Math.hypot(cell.x, cell.z)), 0);
    const boardRadius = data.style === 'polygon' ? maxTrackRadius + 34 : 360;
    add(T,board,new T.CylinderGeometry(boardRadius-8,boardRadius,18,Math.max(8,data.slotCount)),dark,0,-8,0);
    add(T,board,createBoardShape(T,data),felt,0,1,0,false).rotation.x=-Math.PI/2;
    const rim=add(T,board,new T.TorusGeometry(boardRadius-12,3,10,160),gold,0,4,0);
    rim.rotation.x=Math.PI/2;

    data.track.forEach(cell => {
        add(T,board,new T.CylinderGeometry(cell.radius+2,cell.radius+2,5,32),edge,cell.x,5,cell.z,false);
        add(T,board,new T.CylinderGeometry(cell.radius,cell.radius,5.5,32),
            material(T,cell.color,{opacity:cell.opacity,roughness:.48}),cell.x,8,cell.z,false);
        if(cell.start) add(T,board,new T.CylinderGeometry(Math.max(2,cell.radius*.17),Math.max(2,cell.radius*.17),1,20),
            material(T,0xffffff),cell.x,11,cell.z,false);
    });
    data.lanes.forEach(lane => lane.cells.forEach(cell => {
        add(T,board,new T.CylinderGeometry(cell.radius+1.5,cell.radius+1.5,4,32),gold,cell.x,5,cell.z,false);
        add(T,board,new T.CylinderGeometry(cell.radius,cell.radius,4.5,32),
            material(T,lane.color,{opacity:lane.occupied?.28:.08,roughness:.5}),cell.x,8,cell.z,false);
    }));
    data.bases.forEach(base => {
        add(T,board,new T.CylinderGeometry(base.radius,base.radius+3,4,64),
            material(T,base.color,{opacity:.28,roughness:.55}),base.x,5,base.z,false);
        const ring=add(T,board,new T.TorusGeometry(base.radius-2,1.8,8,64),material(T,base.color),base.x,8,base.z,false);
        ring.rotation.x=Math.PI/2;
    });
    add(T,board,new T.CylinderGeometry(23,25,3,48),dark,0,5,0);
    const centerRing=add(T,board,new T.TorusGeometry(18,1.8,10,48),gold,0,7,0,false);
    centerRing.rotation.x=Math.PI/2;

    const pickables=[];
    const addPawn = item => {
        const piece=pawn(T,item.color,item.radius||15,item.playerId,item.pieceId,item.selectable);
        piece.position.set(item.x,11,item.z);
        if(item.selectable) {
            piece.traverse(child => { if(child.isMesh) pickables.push(child); });
        }
        board.add(piece);
    };
    data.bases.forEach(base => base.pieces.forEach(addPawn));
    data.pieces.forEach(addPawn);

    return { board, pickables };
}

export async function render3DBoard(stage, data) {
    if (!stage) return;
    try {
        const { THREE:T, OrbitControls } = await loadThree();
        if (!stage.isConnected) return;
        let renderer=stage._renderer;
        if (!renderer) {
            stage._scene=new T.Scene();
            stage._scene.background=new T.Color(0x18251e);
            stage._camera=new T.PerspectiveCamera(34,1,.1,4000);
            stage._camera.position.set(0,1050,0.01);
            stage._camera.up.set(0,0,-1);
            renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
            renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
            renderer.shadowMap.enabled=true;
            renderer.shadowMap.type=T.PCFSoftShadowMap;
            renderer.outputColorSpace=T.SRGBColorSpace;
            renderer.toneMapping=T.ACESFilmicToneMapping;
            renderer.toneMappingExposure=1.08;
            stage.appendChild(renderer.domElement);
            stage._renderer=renderer;
            stage._scene.add(new T.HemisphereLight(0xe8f4ff,0x28352c,2));
            const key=new T.DirectionalLight(0xffefd9,3.1);
            key.position.set(-420,760,520);key.castShadow=true;
            key.shadow.mapSize.set(1024,1024);
            key.shadow.camera.left=-430;key.shadow.camera.right=430;
            key.shadow.camera.top=430;key.shadow.camera.bottom=-430;
            key.shadow.bias=-.0002;stage._scene.add(key);
            const fill=new T.DirectionalLight(0x9bbcff,1.2);
            fill.position.set(500,420,-520);stage._scene.add(fill);
            stage._controls=new OrbitControls(stage._camera,renderer.domElement);
            stage._controls.target.set(0,0,0);
            stage._controls.enableDamping=true;
            stage._controls.dampingFactor=.07;
            stage._controls.minDistance=520;
            stage._controls.maxDistance=1800;
            stage._controls.maxPolarAngle=Math.PI*.49;
            stage._controls.enableRotate=true;
            stage._controls.update();
            stage._raycaster=new T.Raycaster();
            stage._pointer=new T.Vector2();
            stage._animation=()=> {
                if(!stage.isConnected) return;
                stage._raf=requestAnimationFrame(stage._animation);
                stage._controls.update();
                stage._renderer.render(stage._scene,stage._camera);
            };
            stage._animation();
            stage._resizeObserver=new ResizeObserver(()=>resize(stage));
            stage._resizeObserver.observe(stage);
            stage._onPointerDown=event=>{
                stage._downPoint={x:event.clientX,y:event.clientY};
            };
            stage._onPointerUp=event=>{
                if(!stage._downPoint||Math.hypot(event.clientX-stage._downPoint.x,event.clientY-stage._downPoint.y)>6)return;
                const rect=renderer.domElement.getBoundingClientRect();
                stage._pointer.x=((event.clientX-rect.left)/rect.width)*2-1;
                stage._pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;
                stage._raycaster.setFromCamera(stage._pointer,stage._camera);
                const hits=stage._raycaster.intersectObjects(stage._pickables||[],false);
                const root=hits[0]?.object.userData.pawnRoot;
                const detail=root?.userData;
                if(detail?.selectable) stage.dispatchEvent(new CustomEvent('boardpiececlick',{
                    bubbles:true,detail:{playerId:detail.playerId,pieceId:detail.pieceId}
                }));
                stage._downPoint=null;
            };
            renderer.domElement.addEventListener('pointerdown',stage._onPointerDown);
            renderer.domElement.addEventListener('pointerup',stage._onPointerUp);
            stage._cameraMode='top';
        }
        if(stage._board) {
            stage._scene.remove(stage._board);
            stage._board.traverse(object=>{
                object.geometry?.dispose();
                if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());
                else object.material?.dispose();
            });
        }
        const built=buildScene(T,stage._scene,data);
        stage._board=built.board;
        stage._pickables=built.pickables;
        resize(stage);
    } catch(error) {
        console.error('3D desku se nepodařilo vykreslit:',error);
        stage.textContent='3D desku se nepodařilo načíst. Přepni na 2D SVG.';
    }
}
function resize(stage) {
    const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);
    stage._renderer.setSize(width,height,false);
    stage._camera.aspect=width/height;
    stage._camera.updateProjectionMatrix();
}
