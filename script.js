import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- Configuration ---
const MAZE_SIZE = 15; // Odd number for better walls
const WALL_HEIGHT = 3;
const CELL_SIZE = 4;
const PLAYER_SPEED = 20.0;
const PLAYER_HEIGHT = 1.6;

// --- Global Variables ---
let camera, scene, renderer, controls;
let raycaster;
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let prevTime = performance.now();
let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();
let walls = [];
let maze; // Global maze variable
let cassette;
let gameWon = false;

// --- Maze Generation ---
// 1 = Wall, 0 = Path
function generateMaze(width, height) {
    const maze = Array(height).fill().map(() => Array(width).fill(1));
    const stack = [];
    const startX = 1;
    const startY = 1;

    maze[startY][startX] = 0;
    stack.push({ x: startX, y: startY });

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const neighbors = [];

        const dirs = [
            { x: 0, y: -2 }, // Up
            { x: 0, y: 2 },  // Down
            { x: -2, y: 0 }, // Left
            { x: 2, y: 0 }   // Right
        ];

        for (const dir of dirs) {
            const nx = current.x + dir.x;
            const ny = current.y + dir.y;

            if (nx > 0 && nx < width - 1 && ny > 0 && ny < height - 1 && maze[ny][nx] === 1) {
                neighbors.push({ x: nx, y: ny, dx: dir.x / 2, dy: dir.y / 2 });
            }
        }

        if (neighbors.length > 0) {
            const chosen = neighbors[Math.floor(Math.random() * neighbors.length)];
            maze[chosen.y][chosen.x] = 0;
            maze[current.y + chosen.dy][current.x + chosen.dx] = 0;
            stack.push({ x: chosen.x, y: chosen.y });
        } else {
            stack.pop();
        }
    }
    return maze;
}

// --- Texture Generation ---
function createHedgeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Base Green (Leaves)
    ctx.fillStyle = '#0f3d0f'; // Dark green
    ctx.fillRect(0, 0, 512, 512);

    // Random Leaves
    for (let i = 0; i < 400; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = Math.random() * 20 + 10;
        ctx.fillStyle = `hsl(${100 + Math.random() * 40}, 60%, ${20 + Math.random() * 30}%)`;
        ctx.beginPath();
        // Heart shape rough approximation for leaves
        ctx.moveTo(x, y + size / 4);
        ctx.bezierCurveTo(x, y, x - size / 2, y, x - size / 2, y + size / 4);
        ctx.bezierCurveTo(x - size / 2, y + size / 2, x, y + size * 0.8, x, y + size);
        ctx.bezierCurveTo(x, y + size * 0.8, x + size / 2, y + size / 2, x + size / 2, y + size / 4);
        ctx.bezierCurveTo(x + size / 2, y, x, y, x, y + size / 4);
        ctx.fill();
    }

    // Roses
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = Math.random() * 15 + 10;

        ctx.fillStyle = '#e6005c'; // Rose red
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();

        // Swirl
        ctx.strokeStyle = '#800033';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, size * 0.7, 0, Math.PI * 1.5);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function createFloorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, 512, 512);

    // Grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 512; i += 64) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
    }
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(MAZE_SIZE, MAZE_SIZE);
    return texture;
}

// --- Init ---
init();
animate();

function init() {
    scene = new THREE.Scene();
    // Load Skybox
    const loader = new THREE.TextureLoader();
    loader.load('skybox.jpg', function (texture) {
        scene.background = texture;
    }, undefined, function (err) {
        console.error("Skybox failed to load", err);
        scene.background = new THREE.Color(0x110505); // Fallback
    });
    scene.fog = new THREE.Fog(0x110505, 0, 40);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

    // Lights
    const ambientLight = new THREE.AmbientLight(0x404040, 2); // Soft white light
    scene.add(ambientLight);

    const light = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    light.position.set(0, 20, 0);
    scene.add(light);

    // Controls
    controls = new PointerLockControls(camera, document.body);

    const blocker = document.getElementById('blocker');
    const instructions = document.getElementById('instructions');

    instructions.addEventListener('click', function () {
        controls.lock();
    });

    controls.addEventListener('lock', function () {
        instructions.style.display = 'none';
        blocker.style.display = 'none';
    });

    controls.addEventListener('unlock', function () {
        blocker.style.display = 'flex';
        instructions.style.display = 'flex';
    });

    scene.add(controls.getObject());

    // Maze
    // Maze
    maze = generateMaze(MAZE_SIZE, MAZE_SIZE);
    const wallGeometry = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
    const wallMaterial = new THREE.MeshStandardMaterial({
        map: createHedgeTexture(),
        roughness: 0.8
    });

    // Floor
    const floorGeometry = new THREE.PlaneGeometry(MAZE_SIZE * CELL_SIZE, MAZE_SIZE * CELL_SIZE);
    const floorMaterial = new THREE.MeshStandardMaterial({
        map: createFloorTexture(),
        roughness: 0.8
    });
    // Center floor at the middle of the maze logic grid
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.x = (MAZE_SIZE * CELL_SIZE) / 2;
    floor.position.z = (MAZE_SIZE * CELL_SIZE) / 2;
    scene.add(floor);

    // Build Walls
    const halfCell = CELL_SIZE / 2;
    for (let y = 0; y < MAZE_SIZE; y++) {
        for (let x = 0; x < MAZE_SIZE; x++) {
            if (maze[y][x] === 1) {
                const wall = new THREE.Mesh(wallGeometry, wallMaterial);
                wall.position.set(x * CELL_SIZE + halfCell, WALL_HEIGHT / 2, y * CELL_SIZE + halfCell);
                scene.add(wall);
                walls.push(wall); // Store for collision
            }
        }
    }
    const halfCellSpawn = CELL_SIZE / 2;
    controls.getObject().position.set(1 * CELL_SIZE + halfCellSpawn, PLAYER_HEIGHT, 1 * CELL_SIZE + halfCellSpawn);

    // Create Cassette
    createCassette(maze);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Input
    const onKeyDown = function (event) {
        // Support both physical location (code) and letter (key) for major layouts
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = true;
                break;
        }
        // Fallback for Z/Q specifically if needed on some systems where Code might be weird
        if (event.key === 'z' || event.key === 'Z') moveForward = true;
        if (event.key === 'q' || event.key === 'Q') moveLeft = true;
        // S and D are same usually
        if (event.key === 's' || event.key === 'S') moveBackward = true;
        if (event.key === 'd' || event.key === 'D') moveRight = true;
    };

    const onKeyUp = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = false;
                break;
        }
        if (event.key === 'z' || event.key === 'Z') moveForward = false;
        if (event.key === 'q' || event.key === 'Q') moveLeft = false;
        if (event.key === 's' || event.key === 'S') moveBackward = false;
        if (event.key === 'd' || event.key === 'D') moveRight = false;
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', onWindowResize);
}

function createCassette(maze) {
    // Find a random open spot far from start
    let cx, cy;
    do {
        cx = Math.floor(Math.random() * MAZE_SIZE);
        cy = Math.floor(Math.random() * MAZE_SIZE);
    } while (maze[cy][cx] === 1 || (cx < 4 && cy < 4));

    const geometry = new THREE.BoxGeometry(1, 0.2, 1.5); // Cassette shape
    const material = new THREE.MeshBasicMaterial({ color: 0x333333 }); // Black case
    cassette = new THREE.Group();

    const body = new THREE.Mesh(geometry, material);
    cassette.add(body);

    // Label
    const labelGeo = new THREE.PlaneGeometry(0.8, 1.0);
    const labelMat = new THREE.MeshBasicMaterial({ color: 0xffffff }); // White label
    const label = new THREE.Mesh(labelGeo, labelMat);
    label.rotation.x = -Math.PI / 2;
    label.position.y = 0.11;
    cassette.add(label);

    cassette.position.set(cx * CELL_SIZE, 1, cy * CELL_SIZE);
    scene.add(cassette);

    // Light for cassette
    const pointLight = new THREE.PointLight(0xff00ff, 2, 5);
    pointLight.position.set(cx * CELL_SIZE, 2, cy * CELL_SIZE);
    scene.add(pointLight);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}


// --- Improved Collision & Movement ---


// --- Simplier Collision & Movement ---



function checkCollision(x, z) {
    // Check maze grid
    const radius = 0.15; // Small enough to fit through doors

    // Check 4 corners of the player's bounding box
    const checkPoints = [
        { x: x - radius, z: z - radius },
        { x: x + radius, z: z - radius },
        { x: x - radius, z: z + radius },
        { x: x + radius, z: z + radius }
    ];

    for (const p of checkPoints) {
        const gridX = Math.floor(p.x / CELL_SIZE);
        const gridZ = Math.floor(p.z / CELL_SIZE);

        // Out of bounds
        if (gridX < 0 || gridX >= MAZE_SIZE || gridZ < 0 || gridZ >= MAZE_SIZE) {
            return true;
        }

        // Wall
        if (maze[gridZ][gridX] === 1) {
            return true;
        }
    }
    return false;
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();

    // Debug info overlay
    let debugInfo = "Keys: ";
    if (moveForward) debugInfo += "W/Z ";
    if (moveBackward) debugInfo += "S ";
    if (moveLeft) debugInfo += "A/Q ";
    if (moveRight) debugInfo += "D ";

    // Position debug
    const p = controls.getObject().position;
    debugInfo += `<br>Pos: X=${p.x.toFixed(2)}, Z=${p.z.toFixed(2)}`;

    document.getElementById('info').innerHTML = debugInfo + "<br>Trouve la cassette vidéo !";

    if (controls.isLocked) {
        const delta = (time - prevTime) / 1000;

        // Use simpler movement without inertia for snappier feel
        const speed = 15.0 * delta;

        // Get direction vectors
        const controlObject = controls.getObject();
        const originalPos = controlObject.position.clone();

        // Forward vector (flattened to XZ plane)
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(controlObject.quaternion);
        forward.y = 0;
        forward.normalize();

        // Right vector
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(controlObject.quaternion);
        right.y = 0;
        right.normalize();

        // Calculate move vector
        const moveVector = new THREE.Vector3(0, 0, 0);

        if (moveForward) moveVector.add(forward);
        if (moveBackward) moveVector.sub(forward);
        if (moveRight) moveVector.add(right);
        if (moveLeft) moveVector.sub(right);

        // If moving, normalize and apply speed
        if (moveVector.lengthSq() > 0) {
            moveVector.normalize().multiplyScalar(speed);

            // Try Moving X
            if (!checkCollision(originalPos.x + moveVector.x, originalPos.z)) {
                controlObject.position.x += moveVector.x;
            }

            // Try Moving Z
            if (!checkCollision(controlObject.position.x, originalPos.z + moveVector.z)) {
                controlObject.position.z += moveVector.z;
            }
        }

        // Animate Cassette
        if (cassette) {
            cassette.rotation.y += 2 * delta;
            cassette.position.y = 1 + Math.sin(time * 0.005) * 0.2; // Float effect

            // Check win
            const dist = controlObject.position.distanceTo(cassette.position);
            if (dist < 1.5 && !gameWon) {
                gameWon = true;
                const info = document.getElementById('info');
                info.innerHTML = "VICTOIRE ! TU AS TROUVÉ LA CASSETTE !<br>Appuie sur ESC pour quitter.";
                info.style.color = "#00ff00";
                info.style.textShadow = "0 0 10px #00ff00";
                info.style.top = "40%";
                info.style.fontSize = "40px";
            }
        }
    }

    prevTime = time;

    renderer.render(scene, camera);
}

