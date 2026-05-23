import * as THREE from 'three';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

let minimap, mapMarker;
let currentQuality = 'medium';
let water, simpleWater, sky, sun, treeMesh;
let terrain;

const img = new Image();
img.src = './dem.png'; // เปลี่ยนเป็นแบบสัมพัทธ์ (Relative path)
img.onload = () => {
    initScene(img);
};

function initScene(demImage) {
    // Initialize Leaflet Minimap
    minimap = L.map('minimap-container', {
        zoomControl: false,
        attributionControl: false
    }).setView([14.673476, 98.587705], 14);

    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17
    }).addTo(minimap);

    mapMarker = L.marker([14.673476, 98.587705]).addTo(minimap);

    // 1. Setup Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // Deeper sky blue
    scene.fog = new THREE.FogExp2(0xcce0ff, 0.00012); // Reduced fog for clearer mountains

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 15000);
    // Starting position: Lat 14.669013, Lon 98.587624
    camera.position.set(-9, 180, 497);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.5; // Lower exposure for deeper colors
    document.body.appendChild(renderer.domElement);

    // Setup Post-processing
    const composer = new EffectComposer(renderer);
    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
    ssaoPass.kernelRadius = 8;
    ssaoPass.minDistance = 0.005;
    ssaoPass.maxDistance = 0.05;
    ssaoPass.output = SSAOPass.OUTPUT.Default;
    composer.addPass(ssaoPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 1.5;  // Only bloom extremely bright pixels (sun reflections)
    bloomPass.strength = 0.08;  // Very subtle bloom glow
    bloomPass.radius = 0.3;
    composer.addPass(bloomPass);

    const outputPass = new OutputPass();
    composer.addPass(outputPass);

    window.composer = composer;
    window.ssaoPass = ssaoPass;
    window.bloomPass = bloomPass;

    // 2. Add Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(2000, 3000, 1000);
    dirLight.castShadow = true;
    dirLight.shadow.camera.top = 3000;
    dirLight.shadow.camera.bottom = -3000;
    dirLight.shadow.camera.left = -3000;
    dirLight.shadow.camera.right = 3000;
    dirLight.shadow.camera.far = 10000;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    // 3. Terrain Generation (From DEM)
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(demImage, 0, 0);
    const imgData = ctx.getImageData(0, 0, 256, 256).data;

    const terrainSize = 10000;
    const segments = 255;
    const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const colors = [];
    const colorGrass = new THREE.Color(0x4CAF50);
    const colorLushGrass = new THREE.Color(0x7CB342); // สีเขียวสด ทุ่งหญ้าสวิตเซอร์แลนด์
    const colorDarkForest = new THREE.Color(0x1B5E20);
    const colorMud = new THREE.Color(0x6D4C41);
    const colorRock = new THREE.Color(0x757575);
    
    const streamStart = new THREE.Vector3(420.53, 0, 1687.16);
    const streamEnd = new THREE.Vector3(-73.76, 0, -1334.05);
    const streamDir = new THREE.Vector3().subVectors(streamEnd, streamStart);
    const streamLenSq = streamDir.lengthSq();
    const rightVector = new THREE.Vector3(-streamDir.z, 0, streamDir.x).normalize();

    const vertices = geometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        const index = i / 3;
        const xIndex = index % 256;
        const yIndex = Math.floor(index / 256);
        
        const pIndex = (yIndex * 256 + xIndex) * 4;
        const R = imgData[pIndex];
        const G = imgData[pIndex + 1];
        const B = imgData[pIndex + 2];
        
        let height = (R * 256 + G + B / 256) - 32768;
        height -= 150; 
        height *= 3.0;

        const vx = vertices[i];
        const vz = vertices[i + 2];
        
        // Carving the terrain for the stream
        const vToStart = new THREE.Vector3(vx - streamStart.x, 0, vz - streamStart.z);
        let t = vToStart.dot(streamDir) / streamLenSq;
        t = Math.max(0, Math.min(1, t));
        
        const basePos = new THREE.Vector3().lerpVectors(streamStart, streamEnd, t);
        const currentAmplitude = 120.0 * Math.sin(t * Math.PI);
        const meanderOffset = Math.sin(t * Math.PI * 2 * 4) * currentAmplitude;
        basePos.addScaledVector(rightVector, meanderOffset);
        
        const distToRiver = Math.hypot(vx - basePos.x, vz - basePos.z);
        
        if (distToRiver < 140) {
            if (distToRiver < 50) {
                height = -10; // 100m wide deep river bed
            } else if (distToRiver < 70) {
                const bankT = (distToRiver - 50) / 20;
                height = -10 + bankT * 15;
            } else {
                const outerT = (distToRiver - 70) / 70;
                const smooth = outerT * outerT * (3.0 - 2.0 * outerT);
                height = 5 + smooth * (height - 5);
            }
        } else if (height > 5) {
            height += (Math.random() - 0.5) * 3;
        }

        vertices[i + 1] = height;

        let vertexColor;
        if (distToRiver < 55) {
            vertexColor = new THREE.Color(0x3E2723);
        } else if (distToRiver < 80) {
            const mudT = (distToRiver - 55) / 25;
            vertexColor = new THREE.Color().lerpColors(
                new THREE.Color(0x5D4037),
                colorMud,
                mudT
            );
        } else if (distToRiver < 140) {
            const grassT = (distToRiver - 80) / 60;
            vertexColor = new THREE.Color().lerpColors(colorMud, colorLushGrass, grassT);
        } else if (height < 6) {
            vertexColor = colorMud;
        } else if (height < 70) {
            vertexColor = colorLushGrass; 
        } else if (height > 300) {
            vertexColor = colorRock; 
        } else if (height > 90) {
            vertexColor = colorDarkForest; 
        } else {
            vertexColor = colorGrass; 
        }
        colors.push(vertexColor.r, vertexColor.g, vertexColor.b);
    }

    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({ 
        vertexColors: true,
        roughness: 0.9,
        metalness: 0.0,
        flatShading: false
    });

    material.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            `
            #include <common>
            varying vec3 vWorldPosition;
            `
        ).replace(
            '#include <worldpos_vertex>',
            `
            #include <worldpos_vertex>
            vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
            `
        );
        
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `
            #include <common>
            varying vec3 vWorldPosition;
            float hash(vec3 p) {
                p = fract(p * 0.3183099 + .1);
                p *= 17.0;
                return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
            }
            float noise(vec3 x) {
                vec3 i = floor(x);
                vec3 f = fract(x);
                f = f * f * (3.0 - 2.0 * f);
                return mix(mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
                               mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                           mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                               mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
            }
            `
        ).replace(
            '#include <color_fragment>',
            `
            #include <color_fragment>
            float n = noise(vWorldPosition * 0.5);
            float n2 = noise(vWorldPosition * 2.0);
            float macroNoise = noise(vWorldPosition * 0.01);
            vec3 noiseColor = diffuseColor.rgb * (0.8 + 0.4 * n) * (0.9 + 0.2 * n2);
            diffuseColor.rgb = mix(diffuseColor.rgb, noiseColor, 0.7);
            diffuseColor.rgb *= (0.8 + 0.4 * macroNoise);
            `
        ).replace(
            '#include <normal_fragment_begin>',
            `
            #include <normal_fragment_begin>
            float eps = 0.1;
            float h1 = noise(vWorldPosition * 0.5);
            float h2 = noise((vWorldPosition + vec3(eps, 0, 0)) * 0.5);
            float h3 = noise((vWorldPosition + vec3(0, 0, eps)) * 0.5);
            vec3 bumpNormal = normalize(vec3(h1 - h2, 1.0, h1 - h3));
            normal = normalize(normal + bumpNormal * 0.3);
            `
        ).replace(
            '#include <roughnessmap_fragment>',
            `
            #include <roughnessmap_fragment>
            roughnessFactor = 0.6 + 0.4 * noise(vWorldPosition * 1.0);
            `
        );
    };

    terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    scene.add(terrain);

    // 4. Realistic Sky
    sky = new Sky();
    sky.scale.setScalar(20000);
    scene.add(sky);
    sun = new THREE.Vector3();
    
    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 0.5;
    skyUniforms['rayleigh'].value = 1.5;
    skyUniforms['mieCoefficient'].value = 0.005;
    skyUniforms['mieDirectionalG'].value = 0.95;

    function updateSun(time) {
        const hourAngle = ((time - 12) / 12) * Math.PI; 
        const elevation = Math.cos(hourAngle) * (Math.PI / 2);
        
        const phi = Math.PI / 2 - elevation;
        const theta = hourAngle + Math.PI;
        
        sun.setFromSphericalCoords(1, phi, theta);
        sky.material.uniforms['sunPosition'].value.copy(sun);
        
        if (water && water.material.uniforms['sunDirection']) {
            water.material.uniforms['sunDirection'].value.copy(sun).normalize();
        }
        
        dirLight.position.copy(sun).multiplyScalar(3000);
        
        let intensity = Math.max(0, Math.cos(hourAngle));
        if (intensity === 0 && elevation > -0.2) intensity = 0.1; 
        
        dirLight.intensity = Math.max(0, intensity * 1.5);
        ambientLight.intensity = Math.max(0.02, intensity * 0.4 + 0.02);
        
        if (intensity > 0.2) {
            scene.background = new THREE.Color(0x87CEEB);
        } else if (intensity > 0) {
            scene.background = new THREE.Color(0xE8885A);
        } else {
            scene.background = new THREE.Color(0x000510);
        }
    }

    // Simple Water (For Low Settings)
    const simpleWaterMat = new THREE.MeshStandardMaterial({
        color: 0x226699, 
        transparent: true, opacity: 0.85, roughness: 0.1, metalness: 0.2
    });
    const simpleWaterGeo = new THREE.PlaneGeometry(terrainSize, terrainSize);
    simpleWater = new THREE.Mesh(simpleWaterGeo, simpleWaterMat);
    simpleWater.rotation.x = -Math.PI / 2;
    simpleWater.position.y = -3;
    scene.add(simpleWater);

    // 6. Instanced Trees (Vegetation)
    const MAX_TREES = 15000;
    const treeGeo = new THREE.ConeGeometry(3, 10, 5);
    treeGeo.translate(0, 5, 0);
    const treeMat = new THREE.MeshStandardMaterial({ color: 0x1B5E20, roughness: 0.9 });
    treeMesh = new THREE.InstancedMesh(treeGeo, treeMat, MAX_TREES);
    treeMesh.castShadow = true;
    treeMesh.receiveShadow = true;
    
    const dummy = new THREE.Object3D();
    
    function getHeightAt(x, z) {
        let px = Math.floor((x + terrainSize/2) / terrainSize * 255);
        let pz = Math.floor((z + terrainSize/2) / terrainSize * 255);
        if (px < 0) px = 0; if (px > 255) px = 255;
        if (pz < 0) pz = 0; if (pz > 255) pz = 255;
        
        const pIndex = (pz * 256 + px) * 4;
        const R = imgData[pIndex];
        const G = imgData[pIndex + 1];
        const B = imgData[pIndex + 2];
        
        let h = (R * 256 + G + B / 256) - 32768;
        h -= 150; 
        h *= 3.0;

        const distToRiver = getDistanceToRiver(x, z);
        if (distToRiver < 140) {
            if (distToRiver < 50) {
                h = -10;
            } else if (distToRiver < 70) {
                const bankT = (distToRiver - 50) / 20;
                h = -10 + bankT * 15;
            } else {
                const outerT = (distToRiver - 70) / 70;
                const smooth = outerT * outerT * (3.0 - 2.0 * outerT);
                h = 5 + smooth * (h - 5);
            }
        }
        return h;
    }
    
    for (let i = 0; i < MAX_TREES; i++) {
        const sx = (Math.random() - 0.5) * terrainSize;
        const sz = (Math.random() - 0.5) * terrainSize;
        
        const h = getHeightAt(sx, sz);
        const distToRiver = getDistanceToRiver(sx, sz);
        
        if (h > 70 && h < 300 && distToRiver > 80) {
            dummy.position.set(sx, h, sz);
            const s = 0.5 + Math.random() * 1.0;
            dummy.scale.set(s, s, s);
            
            dummy.rotation.x = (Math.random() - 0.5) * 0.2;
            dummy.rotation.z = (Math.random() - 0.5) * 0.2;
            
            dummy.updateMatrix();
            treeMesh.setMatrixAt(i, dummy.matrix);
        } else {
            dummy.position.set(0, -1000, 0);
            dummy.updateMatrix();
            treeMesh.setMatrixAt(i, dummy.matrix);
        }
    }
    scene.add(treeMesh);

    function getDistanceToRiver(vx, vz) {
        let vToStart = new THREE.Vector3(vx - streamStart.x, 0, vz - streamStart.z);
        let t = vToStart.dot(streamDir) / streamLenSq;
        t = Math.max(0, Math.min(1, t));
        const basePos = new THREE.Vector3().lerpVectors(streamStart, streamEnd, t);
        const currentAmplitude = 120.0 * Math.sin(t * Math.PI);
        const meanderOffset = Math.sin(t * Math.PI * 2 * 4) * currentAmplitude;
        basePos.addScaledVector(rightVector, meanderOffset);
        return Math.hypot(vx - basePos.x, vz - basePos.z);
    }

    // Add Stumps on banks
    const stumpGeo = new THREE.CylinderGeometry(1.5, 2.5, 3.5, 8);
    const stumpMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, roughness: 1.0 });
    for(let i = 0; i < 150; i++) {
        const sx = (Math.random() - 0.5) * terrainSize * 0.3;
        const sz = (Math.random() - 0.5) * terrainSize * 0.3;
        
        const h = getHeightAt(sx, sz);
        const distToRiver = getDistanceToRiver(sx, sz);
        
        if (distToRiver < 80 && distToRiver > 15) {
            const stump = new THREE.Mesh(stumpGeo, stumpMat);
            stump.position.set(sx, h + 1, sz);
            stump.rotation.x = Math.random() * Math.PI;
            stump.rotation.y = Math.random() * Math.PI;
            stump.castShadow = true;
            scene.add(stump);
        }
    }

    // 6.5 Meandering Stream - Flat plane water at river level
    const waterGeo = new THREE.PlaneGeometry(terrainSize, terrainSize);
    const streamMesh = new Water(
        waterGeo,
        {
            textureWidth: 512,
            textureHeight: 512,
            waterNormals: new THREE.TextureLoader().load('./waternormals.jpg', function (texture) { // เปลี่ยนเป็นแบบสัมพัทธ์ (Relative path)
                texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
            }),
            sunDirection: dirLight.position.clone().normalize(),
            sunColor: 0xffffff,
            waterColor: 0x5C4033,
            distortionScale: 1.5,
            fog: scene.fog !== undefined,
            alpha: 0.9
        }
    );
    streamMesh.rotation.x = -Math.PI / 2;
    streamMesh.position.y = -3;
    scene.add(streamMesh);
    
    water = streamMesh;

    // 7. Settings Handlers
    document.getElementById('quality-select').addEventListener('change', (e) => {
        applyQualitySettings(e.target.value);
    });

    document.getElementById('time-slider').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const hours = Math.floor(val);
        const mins = Math.floor((val - hours) * 60);
        document.getElementById('time-display').innerText = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        updateSun(val);
    });

    function applyQualitySettings(quality) {
        currentQuality = quality;
        if (quality === 'low') {
            renderer.shadowMap.enabled = false;
            dirLight.castShadow = false;
            water.visible = false;
            simpleWater.visible = true;
            sky.visible = false;
            if(window.ssaoPass) window.ssaoPass.enabled = false;
            if(window.bloomPass) window.bloomPass.enabled = false;
            treeMesh.count = 2000;
        } else if (quality === 'medium') {
            renderer.shadowMap.enabled = true;
            dirLight.castShadow = true;
            dirLight.shadow.mapSize.width = 1024;
            dirLight.shadow.mapSize.height = 1024;
            water.visible = true;
            simpleWater.visible = false;
            sky.visible = false;
            if(window.ssaoPass) window.ssaoPass.enabled = false;
            if(window.bloomPass) window.bloomPass.enabled = false;
            treeMesh.count = 8000;
        } else if (quality === 'high') {
            renderer.shadowMap.enabled = true;
            dirLight.castShadow = true;
            dirLight.shadow.mapSize.width = 2048;
            dirLight.shadow.mapSize.height = 2048;
            water.visible = true;
            simpleWater.visible = false;
            sky.visible = true;
            if(window.ssaoPass) window.ssaoPass.enabled = true;
            if(window.bloomPass) window.bloomPass.enabled = true;
            treeMesh.count = MAX_TREES;
        }
        
        updateSun(parseFloat(document.getElementById('time-slider').value));
    }
    
    applyQualitySettings('medium');

    // 8. Controls
    const controls = new PointerLockControls(camera, document.body);
    const blocker = document.getElementById('blocker');

    blocker.addEventListener('click', function () {
        controls.lock();
    });

    controls.addEventListener('lock', function () {
        blocker.style.display = 'none';
        document.getElementById('hud').style.display = 'block';
    });

    controls.addEventListener('unlock', function () {
        blocker.style.display = 'flex';
        document.getElementById('hud').style.display = 'none';
    });

    scene.add(controls.getObject());

    // Movement 
    let moveForward = false;
    let moveBackward = false;
    let moveLeft = false;
    let moveRight = false;
    let moveUp = false;
    let moveDown = false;
    let godMode = false;
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    let prevTime = performance.now();
    
    const coordDisplay = document.getElementById('coord-display');
    const modeDisplay = document.getElementById('mode-display');

    document.addEventListener('keydown', (event) => {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': moveForward = true; break;
            case 'ArrowLeft':
            case 'KeyA': moveLeft = true; break;
            case 'ArrowDown':
            case 'KeyS': moveBackward = true; break;
            case 'ArrowRight':
            case 'KeyD': moveRight = true; break;
            case 'Space': moveUp = true; break;
            case 'ShiftLeft':
            case 'ShiftRight': moveDown = true; break;
            case 'KeyG': 
                if (controls.isLocked) {
                    godMode = !godMode; 
                    modeDisplay.innerText = godMode ? '👼 Mode: God (Flying)' : '🚶 Mode: Walk';
                    if (!godMode) velocity.y = 0;
                }
                break;
            case 'KeyM':
                if (controls.isLocked) {
                    const mContainer = document.getElementById('minimap-container');
                    mContainer.style.display = mContainer.style.display === 'none' ? 'block' : 'none';
                }
                break;
        }
    });

    document.addEventListener('keyup', (event) => {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW': moveForward = false; break;
            case 'ArrowLeft':
            case 'KeyA': moveLeft = false; break;
            case 'ArrowDown':
            case 'KeyS': moveBackward = false; break;
            case 'ArrowRight':
            case 'KeyD': moveRight = false; break;
            case 'Space': moveUp = false; break;
            case 'ShiftLeft':
            case 'ShiftRight': moveDown = false; break;
        }
    });

    const raycaster = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0), 0, 5000);

    window.addEventListener('resize', onWindowResize);
    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // Animation Loop
    function animate() {
        requestAnimationFrame(animate);
        const time = performance.now();
        
        if (water && water.material && water.material.uniforms && water.material.uniforms['time']) {
            water.material.uniforms['time'].value += 1.0 / 60.0;
        }

        if (controls.isLocked === true) {
            const delta = (time - prevTime) / 1000;

            velocity.x -= velocity.x * 10.0 * delta;
            velocity.z -= velocity.z * 10.0 * delta;
            if (godMode) {
                velocity.y -= velocity.y * 10.0 * delta;
            } else {
                velocity.y -= 9.8 * 100.0 * delta; 
            }

            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
            direction.normalize();
            
            let directionY = 0;
            if (godMode) {
                directionY = Number(moveUp) - Number(moveDown);
            }

            const speed = godMode ? 800.0 : 250.0; 
            if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
            if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;
            if (godMode && (moveUp || moveDown)) velocity.y -= directionY * speed * delta;

            controls.moveRight(-velocity.x * delta);
            controls.moveForward(-velocity.z * delta);
            
            const camPos = controls.getObject().position;
            if (godMode) {
                camPos.y += -velocity.y * delta;
            }
            
            raycaster.ray.origin.copy(camPos);
            raycaster.ray.origin.y = 2000; 
            
            const intersects = raycaster.intersectObject(terrain);
            if (intersects.length > 0) {
                const groundHeight = intersects[0].point.y;
                if (!godMode) {
                    camPos.y = groundHeight + 2; 
                } else {
                    if (camPos.y < groundHeight + 2) {
                        camPos.y = groundHeight + 2; 
                        velocity.y = 0;
                    }
                }
            } else {
                if (!godMode) camPos.y = Math.max(camPos.y, 2);
            }
            
            const currentLat = 14.673476 - (camPos.z / 111320); 
            const currentLon = 98.587705 + (camPos.x / 107690); 
            
            coordDisplay.innerText = `📍 Lat: ${currentLat.toFixed(6)}, Lon: ${currentLon.toFixed(6)} | Alt: ${Math.floor(camPos.y)}m`;
            
            if (mapMarker && minimap) {
                mapMarker.setLatLng([currentLat, currentLon]);
                minimap.setView([currentLat, currentLon], minimap.getZoom(), { animate: false });
            }
        }

        prevTime = time;
        if (currentQuality === 'high') {
            window.composer.render();
        } else {
            renderer.render(scene, camera);
        }
    }

    animate();
}
