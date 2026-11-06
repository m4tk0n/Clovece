/**
 * Samostatný prémiový Three.js renderer.
 * Scéna se skládá výhradně z čistých herních dat; SVG rendereru se nedotýká.
 * Souřadnice herního modelu (720 × 720) převádíme do prostorové scény.
 */
import { notifyGameExtensions } from './game-extensions.js';

const UNIT = 1 / 42;
let threePromise;
function loadThree() {
    if (!threePromise) {
        const startedAt = performance.now();
        notifyGameExtensions('onResourceLoad', { name: 'Three.js + OrbitControls – načítání', status: '…' });
        threePromise = Promise.all([
            import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js'),
            import('https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/controls/OrbitControls.js')
        ]).then(([THREE, controls]) => {
            notifyGameExtensions('onResourceLoad', { name: 'Three.js + OrbitControls – načteno', status: 'OK', duration: Math.round(performance.now() - startedAt) });
            return { THREE, OrbitControls: controls.OrbitControls };
        }).catch(error => {
            notifyGameExtensions('onResourceLoad', { name: 'Three.js + OrbitControls – chyba načítání', status: 'CHYBA', duration: Math.round(performance.now() - startedAt) });
            threePromise = null;
            throw error;
        });
    }
    return threePromise;
}
export function release3DResources() {
    // Uvolníme vlastní referenci na knihovny; importní cache zůstává správou prohlížeče.
    threePromise = null;
}

function mat(T,color,options={}) {
    return new T.MeshStandardMaterial({color,roughness:options.roughness??.48,metalness:options.metalness??.12,
        transparent:options.opacity!=null&&options.opacity<1,opacity:options.opacity??1});
}
function disposeMaterial(material) {
    if (!material) return;
    // Material.dispose() neuvolňuje automaticky textury, které materiál používá.
    for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
    }
    material.dispose();
}

function disposeObjectResources(root) {
    root?.traverse(object => {
        object.geometry?.dispose();
        if (Array.isArray(object.material)) {
            object.material.forEach(disposeMaterial);
        } else {
            disposeMaterial(object.material);
        }
    });
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
    shape.closePath();return shape;
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
    data.lanes.forEach(lane=>lane.cells.forEach((cell,index)=>{
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
    notifyGameExtensions('onBoardSceneBuilt', { THREE: T, board, data, unit: UNIT });
    return {board,pickables};
}

/**
 * Samostatná fyzická kostka pro 3D režim.
 * Vykresluje se přes Three.js do průhledného překryvu nad celou obrazovkou.
 */
export async function animateThreeDice(value, fast = false, rotationPlan = null) {
    const { THREE: T } = await loadThree();
    const overlay = document.createElement('div');
    overlay.id = 'three-dice-overlay';
    Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '100000',
        display: 'grid', placeItems: 'center',
        background: 'radial-gradient(ellipse at 50% 45%, rgba(74, 91, 72, .42) 0%, rgba(5, 12, 11, .82) 62%, rgba(2, 7, 7, .91) 100%)',
        pointerEvents: 'none', overflow: 'hidden'
    });
    document.body.appendChild(overlay);

    let renderer;
    let frame = 0;
    let settled = false;
    const scene = new T.Scene();
    const finish = () => {
        if (settled) return;
        settled = true;
        if (frame) cancelAnimationFrame(frame);
        scene.traverse(object => {
            object.geometry?.dispose();
            if (Array.isArray(object.material)) object.material.forEach(material => material.dispose());
            else object.material?.dispose();
        });
        renderer?.dispose();
        overlay.remove();
    };

    try {
        // Stejná výsledná velikost jako CSS kostka v režimu 2D (120 px / 104 px na mobilu).
        // FOV odvodíme z rozměru geometrie, vzdálenosti kamery a výšky viewportu.
        const diceSize = window.innerWidth <= 600 ? 104 : 120;
        const cameraDistance = 6.2;
        const diceWorldSize = 1.53;
        const cameraFov = 2 * Math.atan(
            (diceWorldSize * window.innerHeight) / (2 * cameraDistance * diceSize)
        ) * 180 / Math.PI;
        const camera = new T.PerspectiveCamera(
            cameraFov, window.innerWidth / Math.max(1, window.innerHeight), .1, 30
        );
        camera.position.set(0, 0, cameraDistance);
        scene.add(new T.HemisphereLight(0xfff8e9, 0x292b27, 2.0));
        const key = new T.DirectionalLight(0xffe8bd, 4.2);
        key.position.set(-3.5, 5, 6);
        scene.add(key);
        const fill = new T.DirectionalLight(0xe2edff, 2.0);
        fill.position.set(4, 1.5, 4);
        scene.add(fill);
        const rim = new T.DirectionalLight(0xd6a85d, 3.0);
        rim.position.set(2, 3, -4);
        scene.add(rim);
        const sparkle = new T.PointLight(0xffffff, 16, 8);
        sparkle.position.set(-2, 1, 3);
        scene.add(sparkle);

        renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);
        renderer.outputColorSpace = T.SRGBColorSpace;
        renderer.toneMapping = T.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.22;
        Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
        overlay.appendChild(renderer.domElement);

        const die = new T.Group();
        scene.add(die);

        // Zaoblené keramické tělo – geometrie je skutečně prostorová, ne plochá krychle.
        const rounded = new T.Shape();
        const half = .69, radius = .19;
        rounded.moveTo(-half + radius, -half);
        rounded.lineTo(half - radius, -half);
        rounded.absarc(half - radius, -half + radius, radius, -Math.PI / 2, 0, false);
        rounded.lineTo(half, half - radius);
        rounded.absarc(half - radius, half - radius, radius, 0, Math.PI / 2, false);
        rounded.lineTo(-half + radius, half);
        rounded.absarc(-half + radius, half - radius, radius, Math.PI / 2, Math.PI, false);
        rounded.lineTo(-half, -half + radius);
        rounded.absarc(-half + radius, -half + radius, radius, Math.PI, Math.PI * 1.5, false);
        const bodyGeometry = new T.ExtrudeGeometry(rounded, {
            depth: 1.32, bevelEnabled: true, bevelSegments: 7,
            steps: 1, bevelSize: .075, bevelThickness: .075, curveSegments: 12
        });
        bodyGeometry.center();
        const bodyMaterial = new T.MeshPhysicalMaterial({
            color: 0xf4ead5, roughness: .19, metalness: .08,
            clearcoat: 1, clearcoatRoughness: .12,
            reflectivity: .9
        });
        const body = new T.Mesh(bodyGeometry, bodyMaterial);
        body.castShadow = true;
        die.add(body);

        // Jemný zlatý lem kopíruje obrys těla; nepřekrývá hrací plochy.
        const edgeGeometry = new T.EdgesGeometry(bodyGeometry, 35);
        const edge = new T.LineSegments(edgeGeometry, new T.LineBasicMaterial({
            color: 0xd7b66f, transparent: true, opacity: .58
        }));
        die.add(edge);

        const pipGeometry = new T.SphereGeometry(.112, 32, 24);
        const pipMaterial = new T.MeshPhysicalMaterial({
            color: 0x25201b, roughness: .2, metalness: .12,
            clearcoat: .9, clearcoatRoughness: .1
        });
        const redPipMaterial = new T.MeshPhysicalMaterial({
            color: 0xb52b27, roughness: .18, metalness: .08,
            clearcoat: 1, clearcoatRoughness: .08
        });
        const pipRings = new T.TorusGeometry(.116, .009, 8, 36);
        const ringMaterial = new T.MeshStandardMaterial({ color: 0xb58b49, metalness: .86, roughness: .24 });
        const layouts = {
            1: [[0, 0]],
            2: [[-.34, .34], [.34, -.34]],
            3: [[-.34, .34], [0, 0], [.34, -.34]],
            4: [[-.34, .34], [.34, .34], [-.34, -.34], [.34, -.34]],
            5: [[-.34, .34], [.34, .34], [0, 0], [-.34, -.34], [.34, -.34]],
            6: [[-.34, .38], [.34, .38], [-.34, 0], [.34, 0], [-.34, -.38], [.34, -.38]]
        };
        const addFacePips = (faceValue, axis) => {
            for (const [u, v] of layouts[faceValue]) {
                const pip = new T.Mesh(pipGeometry, faceValue === 1 ? redPipMaterial : pipMaterial);
                const ring = new T.Mesh(pipRings, ringMaterial);
                const d = .704;
                if (axis === '+z') { pip.position.set(u, v, d); ring.position.set(u, v, .738); }
                if (axis === '-z') { pip.position.set(-u, v, -d); ring.position.set(-u, v, -.738); ring.rotation.y = Math.PI; }
                if (axis === '+x') { pip.position.set(d, v, -u); ring.position.set(.738, v, -u); ring.rotation.y = Math.PI / 2; }
                if (axis === '-x') { pip.position.set(-d, v, u); ring.position.set(-.738, v, u); ring.rotation.y = -Math.PI / 2; }
                if (axis === '+y') { pip.position.set(u, d, -v); ring.position.set(u, .738, -v); ring.rotation.x = -Math.PI / 2; }
                if (axis === '-y') { pip.position.set(u, -d, v); ring.position.set(u, -.738, v); ring.rotation.x = Math.PI / 2; }
                die.add(ring, pip);
            }
        };
        addFacePips(1, '+z');
        addFacePips(6, '-z');
        addFacePips(2, '+x');
        addFacePips(5, '-x');
        addFacePips(3, '+y');
        addFacePips(4, '-y');

        // Měkký stín pod kostkou a nenápadný zlatý odlesk v prostoru.
        const shadow = new T.Mesh(
            new T.CircleGeometry(.95, 64),
            new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false })
        );
        shadow.position.set(0, -1.15, -1.15);
        shadow.scale.set(1.25, .34, 1);
        scene.add(shadow);

        const plan = rotationPlan || {
            startX: 0, startY: 0, endX: 0, endY: 0,
            duration: fast ? 0 : 1500, fast
        };
        const toRadians = degrees => degrees * Math.PI / 180;
        const start = [toRadians(plan.startX - 24), toRadians(plan.startY - 32), 0];
        const end = [toRadians(plan.endX - 24), toRadians(plan.endY - 32), 0];
        die.rotation.set(...start);
        die.scale.setScalar(plan.fast ? 1 : .01);
        const duration = plan.duration;
        const totalDuration = plan.fast ? 450 : duration;
        const started = performance.now();

        // Stejná kubická Bézierova křivka jako CSS transition kostky v 2D.
        const ease = progress => {
            const x1 = .2, y1 = .7, x2 = .25, y2 = 1;
            let low = 0, high = 1, t = progress;
            for (let i = 0; i < 18; i++) {
                t = (low + high) / 2;
                const inverse = 1 - t;
                const x = 3 * inverse * inverse * t * x1
                    + 3 * inverse * t * t * x2 + t * t * t;
                if (x < progress) low = t;
                else high = t;
            }
            const inverse = 1 - t;
            return 3 * inverse * inverse * t * y1
                + 3 * inverse * t * t * y2 + t * t * t;
        };
        return await new Promise(resolve => {
            const animate = now => {
                if (!overlay.isConnected) {
                    finish();
                    resolve();
                    return;
                }
                const elapsed = now - started;
                const raw = duration === 0 ? 1 : Math.min(1, elapsed / duration);
                const eased = ease(raw);
                die.rotation.set(
                    start[0] + (end[0] - start[0]) * eased,
                    start[1] + (end[1] - start[1]) * eased,
                    start[2] + (end[2] - start[2]) * eased
                );
                const bounce = plan.fast ? 0 : (raw < .72
                    ? Math.sin(raw / .72 * Math.PI) * .72
                    : Math.sin((raw - .72) / .28 * Math.PI) * .12);
                die.position.y = Math.max(0, bounce);
                const scale = plan.fast ? 1 : (raw < .12 ? .01 + (raw / .12) * .99 : 1);
                die.scale.setScalar(scale);
                shadow.material.opacity = .12 + (1 - Math.min(1, bounce)) * .22;
                shadow.scale.x = 1.1 + bounce * .2;
                if (elapsed >= totalDuration) {
                    die.rotation.set(...end);
                    die.position.y = 0;
                    renderer.render(scene, camera);
                    finish();
                    resolve();
                    return;
                }
                renderer.render(scene, camera);
                frame = requestAnimationFrame(animate);
            };
            frame = requestAnimationFrame(animate);
        });
    } catch (error) {
        finish();
        throw error;
    }
}

export async function render3DBoard(stage,data,onError=()=>{}) {
    if(!stage)return;
    const reportError=error=>{
        if(stage._fallbackTriggered)return;
        stage._fallbackTriggered=true;
        onError(error);
    };
    stage._fallbackTriggered=false;
    try{
        const {THREE:T,OrbitControls}=await loadThree();if(!stage.isConnected)return;
        const maxRadius=data.track.reduce((m,p)=>Math.max(m,Math.hypot(p.x,p.z)),0);
        const boardRadius=(data.style==='polygon'?maxRadius+34:360)*UNIT;data.boardRadius=boardRadius/UNIT;
        let renderer=stage._renderer;
        if(!renderer){
            stage._scene=new T.Scene();stage._scene.background=new T.Color(0x18251e);
            stage._camera=new T.PerspectiveCamera(34,1,.1,100);stage._camera.position.set(11.882,18.142,-24.349);
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
            stage._controls=new OrbitControls(stage._camera,renderer.domElement);stage._controls.target.set(0,-1.4703962334,0);
            stage._controls.enableDamping=true;stage._controls.dampingFactor=.07;
            stage._controls.minDistance=boardRadius*1.25;stage._controls.maxDistance=boardRadius*4;
            stage._controls.maxPolarAngle=Math.PI*.49;stage._controls.update();
            stage._raycaster=new T.Raycaster();stage._pointer=new T.Vector2();
            stage._onContextLost=event=>{
                event.preventDefault();
                reportError(new Error('WebGL context byl ztracen.'));
            };
            renderer.domElement.addEventListener('webglcontextlost',stage._onContextLost,false);
            stage._onRenderError=reportError;
            stage._animation=()=>{
                if(!stage.isConnected)return;
                stage._raf=requestAnimationFrame(stage._animation);
                try{
                    stage._controls.update();
                    stage._renderer.render(stage._scene,stage._camera);
                }catch(error){
                    reportError(error);
                }
            };
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
            stage._camera.position.set(0,boardRadius*2.75,boardRadius*2.15);stage._controls.target.set(0,.1,0);
            stage._controls.minDistance=boardRadius*1.25;stage._controls.maxDistance=boardRadius*4;
            stage._controls.update();stage._boardRadius=boardRadius;
        }
        if(stage._board){stage._scene.remove(stage._board);disposeObjectResources(stage._board)}
        const built=buildScene(T,stage._scene,data);stage._board=built.board;stage._pickables=built.pickables;resize(stage);
        notifyGameExtensions('onBoardStageReady', stage);
    }catch(error){
        console.error('3D desku se nepodařilo vykreslit:',error);
        reportError(error);
    }
}
function resize(stage){
    const width=Math.max(1,stage.clientWidth),height=Math.max(1,stage.clientHeight);
    stage._renderer.setSize(width,height,false);stage._camera.aspect=width/height;stage._camera.updateProjectionMatrix();
}
export function dispose3DBoard(stage){
    if(!stage)return;
    notifyGameExtensions('onBoardDispose', stage);
    if(stage._raf)cancelAnimationFrame(stage._raf);stage._resizeObserver?.disconnect();
    if(stage._onPointerDown)stage._renderer?.domElement.removeEventListener('pointerdown',stage._onPointerDown);
    if(stage._onPointerUp)stage._renderer?.domElement.removeEventListener('pointerup',stage._onPointerUp);
    if(stage._onContextLost)stage._renderer?.domElement.removeEventListener('webglcontextlost',stage._onContextLost);
    stage._controls?.dispose();disposeObjectResources(stage._board);
    stage._renderer?.dispose();stage._renderer?.domElement.remove();
    stage._controls=null;stage._board=null;stage._pickables=null;stage._scene=null;stage._camera=null;
    stage._raycaster=null;stage._pointer=null;stage._renderer=null;stage._raf=null;stage._animation=null;
    stage._resizeObserver=null;stage._onPointerDown=null;stage._onPointerUp=null;stage._onContextLost=null;
}
