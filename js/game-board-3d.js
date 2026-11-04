/**
 * Three.js vykreslení skutečných prostorových figurek.
 * Deska, pozice, výběr i klikací SVG cíle zůstávají beze změny.
 */
let threeModulePromise = null;

function loadThree() {
    if (!threeModulePromise) {
        threeModulePromise = import('https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js')
            .catch(error => {
                threeModulePromise = null;
                throw error;
            });
    }
    return threeModulePromise;
}

function pawnGeometry(THREE) {
    const profile = [
        new THREE.Vector2(0.00, 0.02),
        new THREE.Vector2(0.72, 0.02),
        new THREE.Vector2(0.82, 0.10),
        new THREE.Vector2(0.78, 0.24),
        new THREE.Vector2(0.54, 0.34),
        new THREE.Vector2(0.39, 0.55),
        new THREE.Vector2(0.34, 0.76),
        new THREE.Vector2(0.43, 0.94),
        new THREE.Vector2(0.00, 0.94)
    ];
    return new THREE.LatheGeometry(profile, 32);
}

function pawnMaterials(THREE, color) {
    return {
        body: new THREE.MeshStandardMaterial({
            color, roughness: 0.24, metalness: 0.12
        }),
        dark: new THREE.MeshStandardMaterial({
            color: 0x17201d, roughness: 0.32, metalness: 0.08
        }),
        highlight: new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.16, metalness: 0.05
        })
    };
}

function makePawn(THREE, color, x, y, radius) {
    const group = new THREE.Group();
    const materials = pawnMaterials(THREE, color);
    const scale = radius;

    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.82, 0.92, 0.22, 40),
        materials.dark
    );
    base.position.y = 0.12;
    base.scale.set(scale, scale, scale);
    base.castShadow = true;
    base.receiveShadow = true;
    group.add(base);

    const body = new THREE.Mesh(pawnGeometry(THREE), materials.body);
    body.position.y = 0.18;
    body.scale.set(scale, scale, scale);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.31, 0.39, 0.22, 32),
        materials.body
    );
    neck.position.y = 1.08 * scale;
    neck.scale.set(scale, scale, scale);
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.40 * scale, 32, 24),
        materials.body
    );
    head.position.y = 1.43 * scale;
    head.castShadow = true;
    head.receiveShadow = true;
    group.add(head);

    const glint = new THREE.Mesh(
        new THREE.SphereGeometry(0.075 * scale, 12, 10),
        materials.highlight
    );
    glint.position.set(-0.13 * scale, 1.57 * scale, 0.31 * scale);
    group.add(glint);

    group.position.set(x, y, 2);
    group.userData.playerColor = color;
    return group;
}

export async function render3DPawns(container, svg, enabled) {
    if (!container || !svg) return;
    let layer = container.querySelector('.three-pawns-layer');

    if (!enabled) {
        svg.classList.remove('three-pawns-active');
        if (layer) layer.style.display = 'none';
        return;
    }

    try {
        const THREE = await loadThree();
        // Po dokončení importu ověřit, že uživatel mezitím nepřepnul zpět do 2D.
        if (!container.isConnected || !svg.isConnected ||
            !container.querySelector('.premium-board') ||
            container.querySelector('.premium-board') !== svg) return;

        const width = svg.clientWidth;
        const height = svg.clientHeight;
        if (!width || !height) return;

        if (!layer) {
            layer = document.createElement('div');
            layer.className = 'three-pawns-layer';
            const shell = container.querySelector('.premium-board-shell');
            shell.appendChild(layer);
        }

        layer.style.left = svg.offsetLeft + 'px';
        layer.style.top = svg.offsetTop + 'px';
        layer.style.width = width + 'px';
        layer.style.height = height + 'px';
        layer.style.transform = svg.style.transform || '';
        layer.style.transformOrigin = svg.style.transformOrigin || '50% 50%';
        layer.style.display = 'block';

        let renderer = layer._renderer;
        if (!renderer) {
            renderer = new THREE.WebGLRenderer({
                alpha: true, antialias: true, powerPreference: 'low-power'
            });
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
            renderer.setClearColor(0x000000, 0);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            layer.appendChild(renderer.domElement);
            layer._renderer = renderer;
            layer._scene = new THREE.Scene();
            layer._camera = new THREE.OrthographicCamera(0, 720, 720, 0, 0.1, 2000);
            layer._camera.position.set(360, 360, 1100);
            layer._camera.lookAt(360, 360, 0);

            const ambient = new THREE.HemisphereLight(0xffffff, 0x303a35, 2.0);
            layer._scene.add(ambient);
            const key = new THREE.DirectionalLight(0xffffff, 3.0);
            key.position.set(-260, -380, 700);
            key.castShadow = true;
            layer._scene.add(key);
            const fill = new THREE.DirectionalLight(0x9fc5ff, 0.8);
            fill.position.set(500, 300, 400);
            layer._scene.add(fill);
        }

        renderer.setSize(width, height, false);
        layer._camera.left = 0;
        layer._camera.right = 720;
        layer._camera.top = 720;
        layer._camera.bottom = 0;
        layer._camera.updateProjectionMatrix();

        const scene = layer._scene;
        const oldPawns = scene.children.filter(child => child.userData.isPawn);
        oldPawns.forEach(pawn => {
            scene.remove(pawn);
            pawn.traverse(object => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) object.material.forEach(m => m.dispose());
                    else object.material.dispose();
                }
            });
        });

        svg.querySelectorAll('.pawn-piece[data-x][data-y]').forEach(node => {
            const color = node.dataset.color || '#c6a96b';
            const x = Number(node.dataset.x);
            const y = 720 - Number(node.dataset.y);
            const playerId = Number(node.dataset.player);
            const radius = Number(node.dataset.radius) || 16;
            const pawn = makePawn(THREE, color.trim(), x, y, radius);
            pawn.userData.isPawn = true;
            scene.add(pawn);
        });

        renderer.render(scene, layer._camera);
        svg.classList.add('three-pawns-active');
    } catch (error) {
        console.warn('3D figurky se nepodařilo načíst; zůstává původní vykreslení:', error);
        svg.classList.remove('three-pawns-active');
        if (layer) layer.style.display = 'none';
    }
}
