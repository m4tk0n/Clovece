/**
 * Kompletní 3D deska. Logické souřadnice přebírá z SVG rendereru,
 * takže pravidla, varianty classic/polygon a klikání zůstávají beze změny.
 */
let threePromise;
function loadThree() {
    if (!threePromise) threePromise = import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js')
        .catch(error => { threePromise = null; throw error; });
    return threePromise;
}
const materials = new Map();
function mat(T, color, options = {}) {
    const key = String(color) + JSON.stringify(options);
    if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({
        color: color || '#c6a96b', roughness: options.roughness ?? .45,
        metalness: options.metalness ?? .12, transparent: options.opacity != null && options.opacity < 1,
        opacity: options.opacity ?? 1, side: T.DoubleSide
    }));
    return materials.get(key);
}
function add(T, parent, geometry, material, x, y, z, shadows = true) {
    const object = new T.Mesh(geometry, material);
    object.position.set(x, y, z);
    object.castShadow = shadows;
    object.receiveShadow = true;
    parent.add(object);
    return object;
}
function attr(node, name, fallback = 0) {
    const value = Number(node?.getAttribute(name));
    return Number.isFinite(value) ? value : fallback;
}
function pawn(T, color, radius) {
    const g = new T.Group();
    const s = Math.max(10, radius) / 15;
    const plastic = mat(T, color, { roughness: .2, metalness: .04 });
    const dark = mat(T, 0x17211d, { roughness: .32, metalness: .35 });
    const gold = mat(T, 0xc6a96b, { roughness: .24, metalness: .72 });
    add(T, g, new T.CylinderGeometry(.78*s,.86*s,.19*s,36), dark, 0,.095*s,0);
    add(T, g, new T.CylinderGeometry(.75*s,.78*s,.045*s,36), gold, 0,.205*s,0);
    const profile = [[0,.20],[.68,.20],[.76,.27],[.69,.40],[.49,.57],[.35,.83],[.37,1.03],[.48,1.13],[0,1.13]]
        .map(([x,y]) => new T.Vector2(x*s,y*s));
    const body = new T.Mesh(new T.LatheGeometry(profile,36), plastic);
    body.castShadow = true; body.receiveShadow = true; g.add(body);
    add(T,g,new T.CylinderGeometry(.34*s,.39*s,.15*s,28),plastic,0,1.15*s,0);
    add(T,g,new T.SphereGeometry(.39*s,32,24),plastic,0,1.40*s,0);
    const shine = add(T,g,new T.SphereGeometry(.055*s,12,10),new T.MeshBasicMaterial({color:0xffffff}),-.13*s,1.51*s,.30*s,false);
    shine.scale.set(1.2,.7,.45);
    return g;
}
function build(T, scene, svg) {
    const board = new T.Group(); scene.add(board);
    const dark=mat(T,0x17221d,{roughness:.3,metalness:.4});
    const felt=mat(T,0x294638,{roughness:.88});
    const gold=mat(T,0xc6a96b,{roughness:.24,metalness:.72});
    const edge=mat(T,0x9ba99f,{roughness:.38,metalness:.2});

    // Tělo desky a kovové lemování.
    add(T,board,new T.CylinderGeometry(350,356,18,8),dark,0,-1,0);
    add(T,board,new T.CylinderGeometry(344,350,5,8),gold,0,10.5,0);
    add(T,board,new T.CylinderGeometry(340,344,3,8),felt,0,14.5,0);
    const rim=new T.Mesh(new T.TorusGeometry(343,2.8,10,128),gold);
    rim.rotation.x=Math.PI/2; rim.position.y=16.3; board.add(rim);

    // Políčka se čtou z výsledné geometrie SVG – funguje pro 40/48/80.
    svg.querySelectorAll('.track-space circle').forEach(c=>{
        const x=attr(c,'cx')-360,z=attr(c,'cy')-360,r=attr(c,'r',13);
        const color=c.getAttribute('fill')||'#d9d2c3';
        add(T,board,new T.CylinderGeometry(r+2,r+2,5,32),edge,x,19,z,false);
        add(T,board,new T.CylinderGeometry(r,r,5.5,32),mat(T,color,{opacity:attr(c,'fill-opacity',1),roughness:.48}),x,24,z,false);
        if(c.parentElement?.classList.contains('track-start'))
            add(T,board,new T.CylinderGeometry(Math.max(2,r*.17),Math.max(2,r*.17),1,20),mat(T,0xffffff),x,27.5,z,false);
    });
    // Barevné cílové dráhy.
    svg.querySelectorAll('.home-lane circle').forEach(c=>{
        const x=attr(c,'cx')-360,z=attr(c,'cy')-360,r=attr(c,'r',13);
        const color=c.getAttribute('fill')||'#c6a96b';
        add(T,board,new T.CylinderGeometry(r+1.5,r+1.5,4,32),gold,x,18.5,z,false);
        add(T,board,new T.CylinderGeometry(r,r,4.5,32),mat(T,color,{opacity:attr(c,'fill-opacity',.2),roughness:.5}),x,22.5,z,false);
    });
    // Startovní základny všech hráčů.
    svg.querySelectorAll('.base-zone > circle').forEach(c=>{
        const x=attr(c,'cx')-360,z=attr(c,'cy')-360,r=attr(c,'r',50);
        const color=c.getAttribute('stroke')||'#c6a96b';
        add(T,board,new T.CylinderGeometry(r,r+3,4,64),mat(T,color,{opacity:.3,roughness:.55}),x,18,z,false);
        const ring=new T.Mesh(new T.TorusGeometry(r-2,1.8,8,64),mat(T,color));
        ring.rotation.x=Math.PI/2;ring.position.set(x,21,z);board.add(ring);
    });
    // Středový medailon.
    add(T,board,new T.CylinderGeometry(23,25,3,48),dark,0,17,0);
    const centerRing=new T.Mesh(new T.TorusGeometry(18,1.8,10,48),gold);
    centerRing.rotation.x=Math.PI/2;centerRing.position.y=19;board.add(centerRing);

    // Figurky kopírují přesné logické pozice ze SVG datových atributů.
    svg.querySelectorAll('.pawn-piece[data-x][data-y]').forEach(node=>{
        const p=pawn(T,node.getAttribute('data-color')||'#c6a96b',attr(node,'data-radius',15));
        p.position.set(attr(node,'data-x')-360,26,attr(node,'data-y')-360);
        p.rotation.y=(attr(node,'data-player')||0)*Math.PI/4;
        board.add(p);
    });
    const floor=add(T,board,new T.PlaneGeometry(1200,1200),mat(T,0x101914,{roughness:.96}),0,-12,0,false);
    floor.rotation.x=-Math.PI/2;
    return board;
}

export async function render3DPawns(container, svg, enabled) {
    if(!container||!svg)return;
    let layer=container.querySelector('.three-pawns-layer');
    if(!enabled){
        svg.style.opacity='';svg.style.pointerEvents='';
        svg.classList.remove('three-pawns-active');
        if(layer)layer.style.display='none';
        return;
    }
    try{
        const T=await loadThree();
        if(!container.isConnected||!svg.isConnected||container.querySelector('.premium-board')!==svg)return;
        if(!layer){
            layer=document.createElement('div');layer.className='three-pawns-layer';
            container.querySelector('.premium-board-shell').appendChild(layer);
        }
        layer.style.left=svg.offsetLeft+'px';layer.style.top=svg.offsetTop+'px';
        layer.style.width=svg.clientWidth+'px';layer.style.height=svg.clientHeight+'px';
        layer.style.transform=svg.style.transform||'';layer.style.transformOrigin='50% 50%';layer.style.display='block';
        let renderer=layer._renderer;
        if(!renderer){
            renderer=new T.WebGLRenderer({alpha:true,antialias:true,powerPreference:'high-performance'});
            renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
            renderer.setClearColor(0x000000,0);renderer.outputColorSpace=T.SRGBColorSpace;
            renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.08;
            renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
            layer.appendChild(renderer.domElement);layer._renderer=renderer;
            layer._scene=new T.Scene();layer._scene.background=new T.Color(0x111a15);
            layer._camera=new T.PerspectiveCamera(37,1,1,3000);
            layer._camera.position.set(0,790,900);layer._camera.lookAt(0,0,0);
            layer._scene.add(new T.HemisphereLight(0xe8f4ff,0x28352c,2));
            const key=new T.DirectionalLight(0xffefd9,3.1);key.position.set(-420,760,520);
            key.castShadow=true;key.shadow.mapSize.set(1024,1024);
            key.shadow.camera.left=-430;key.shadow.camera.right=430;
            key.shadow.camera.top=430;key.shadow.camera.bottom=-430;key.shadow.bias=-.0002;
            layer._scene.add(key);
            const fill=new T.DirectionalLight(0x9bbcff,1.2);fill.position.set(500,420,-520);layer._scene.add(fill);
        }
        const width=Math.max(1,svg.clientWidth),height=Math.max(1,svg.clientHeight);
        renderer.setSize(width,height,false);layer._camera.aspect=width/height;layer._camera.updateProjectionMatrix();
        if(layer._board){
            layer._scene.remove(layer._board);
            layer._board.traverse(o=>{if(o.geometry)o.geometry.dispose();});
        }
        layer._board=build(T,layer._scene,svg);renderer.render(layer._scene,layer._camera);
        // SVG zůstává průhlednou interakční vrstvou pro stávající výběr figurek.
        svg.style.opacity='0';svg.style.pointerEvents='all';svg.classList.add('three-pawns-active');
        if(!layer._resizeObserver&&typeof ResizeObserver!=='undefined'){
            layer._resizeObserver=new ResizeObserver(()=>{
                if(layer.isConnected&&layer.style.display!=='none')render3DPawns(container,svg,true);
            });
            layer._resizeObserver.observe(svg);
        }
    }catch(error){
        console.warn('3D desku se nepodařilo načíst; obnovuji 2D desku:',error);
        svg.style.opacity='';svg.style.pointerEvents='';svg.classList.remove('three-pawns-active');
        if(layer)layer.style.display='none';
    }
}
