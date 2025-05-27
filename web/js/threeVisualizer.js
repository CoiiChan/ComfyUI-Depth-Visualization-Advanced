import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let apiURL = '';
let currentDepthStrength = 1.5;
let currentDofStrength = 0.0;
let currentFocusDistance = 0.0;
let currentZOffset = 0.0; // 添加Z轴偏移变量
let currentDepthMesh = null;
const BASE_CAMERA_DISTANCE = 5.0; // 修改基础相机距离为5（fov90时）
let currentScreenshotSize = 1024; // 默认截图尺寸

// 添加Quilts相关变量
let currentQuiltsNum = 4;
let currentQuiltsAngleRange = 14; // 默认角度差为14度
let isQuiltsMode = false;
let quiltsProgress = 0;
let quiltsStartTime = null;
let quiltsCurrentFrame = 0;
let quiltsTargetRotation = 0;
let quiltsIsRotating = false;
const QUILTS_DURATION = 1000; // 1秒完成一次旋转

// 添加存储截图的数组
let quiltsScreenshots = [];

// Listen for messages from the parent window
window.addEventListener('message', function(event) {
    if (event.data.type === 'init') {
        apiURL = event.data.apiURL;
    } else if (event.data.type === 'update') {
        if (event.data.depthStrength !== undefined) {
            currentDepthStrength = event.data.depthStrength;
            if (currentDepthMesh && currentDepthMesh.material) {
                currentDepthMesh.material.uniforms.depthScale.value = 5.0 * currentDepthStrength;
                // 当深度强度改变时，也需要更新Z轴偏移
                const finalZOffset = currentZOffset - (currentDepthStrength * 5 / 2);
                currentDepthMesh.position.z = finalZOffset;
            }
        }
        if (event.data.dofStrength !== undefined) {
            currentDofStrength = event.data.dofStrength;
            if (currentDepthMesh && currentDepthMesh.material) {
                currentDepthMesh.material.uniforms.dofStrength.value = currentDofStrength;
            }
        }
        if (event.data.focusDistance !== undefined) {
            currentFocusDistance = event.data.focusDistance;
            if (currentDepthMesh && currentDepthMesh.material) {
                currentDepthMesh.material.uniforms.focusDistance.value = currentFocusDistance;
            }
        }
        if (event.data.referenceImage && event.data.depthMap) {
            main(event.data.referenceImage, event.data.depthMap);
        }
    } else if (event.data.type === 'resetView') {
        resetView(event.data.depthStrength);
    } else if (event.data.type === 'updateQuiltsNum') {
        currentQuiltsNum = event.data.value;
    } else if (event.data.type === 'updateQuiltsAngleRange') {
        currentQuiltsAngleRange = event.data.value;
    } else if (event.data.type === 'updateScreenshotSize') {
        currentScreenshotSize = event.data.value;
    } else if (event.data.type === 'toggleQuilts') {
        if (!isQuiltsMode) {
            startQuilts();
        } else {
            stopQuilts();
        }
    } else if (event.data.type === 'updateZOffset') {
        currentZOffset = event.data.value;
        if (currentDepthMesh) {
            // 计算最终的Z轴偏移值
            const finalZOffset = currentZOffset - (currentDepthStrength * 5 / 2);
            currentDepthMesh.position.z = finalZOffset;
        }
    } else if (event.data.type === 'updateCameraFOV') {
        // 更新相机FOV
        camera.fov = event.data.value;
        camera.updateProjectionMatrix();
    }
}, false);

const visualizer = document.getElementById("visualizer");
const container = document.getElementById("container");
const progressDialog = document.getElementById("progress-dialog");
const progressIndicator = document.getElementById("progress-indicator");

const renderer = new THREE.WebGLRenderer({ antialias: true, extensions: {
    derivatives: true
}});
renderer.setPixelRatio(window.devicePixelRatio);

// 添加旋转信息显示元素
const rotationDisplay = document.createElement('div');
rotationDisplay.style.cssText = `
    position: absolute;
    top: 10px;
    left: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 10px;
    z-index: 1000;
    margin-bottom: 2px;
    width: 195px;
    text-align: left;
    white-space: nowrap;
    line-height: 1.2;
`;
container.appendChild(rotationDisplay);

// 修改距离显示元素
const distanceDisplay = document.createElement('div');
distanceDisplay.style.cssText = `
    position: absolute;
    top: 32px;
    left: 10px;
    background: rgba(0, 0, 0, 0.7);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-family: monospace;
    font-size: 10px;
    z-index: 1000;
    width: 85px;
    text-align: left;
    line-height: 1.2;
`;
container.appendChild(distanceDisplay);

// 设置1:1画布
function updateRendererSize() {
    const size = Math.min(window.innerWidth, window.innerHeight);
    renderer.setSize(size, size);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    
    // 将渲染器容器移到左侧
    container.style.cssText = `
        position: absolute;
        left: 0;
        top: 0;
        width: ${size}px;
        height: ${size}px;
    `;
}

const pmremGenerator = new THREE.PMREMGenerator(renderer);

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.04).texture;

// 添加中心点标记
const centerPoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff0000 })
);
centerPoint.name = 'centerPoint';
scene.add(centerPoint);

// 添加坐标轴
const axesHelper = new THREE.AxesHelper(5);
axesHelper.name = 'axesHelper';
scene.add(axesHelper);

const ambientLight = new THREE.AmbientLight(0xffffff);

const camera = new THREE.PerspectiveCamera(7, 1, 0.1, 1000); // 设置默认FOV为7度
camera.position.set(0, 0, 10);
const pointLight = new THREE.PointLight(0xffffff, 15);
camera.add(pointLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.update();
controls.enablePan = true;
controls.enableDamping = true;
controls.rotateSpeed = 1.0; // 调整旋转速度
controls.dampingFactor = 0.05; // 调整阻尼系数

// 修改距离显示函数
function updateDistanceDisplay() {
    const distance = camera.position.length();
    distanceDisplay.textContent = `Distance: ${distance.toFixed(1)}`;
}

// 修改OrbitControls的更新回调
controls.addEventListener('change', () => {
    updateDistanceDisplay();
    updateRotationDisplay();
});

// 修改窗口大小处理函数
window.onresize = function () {
    updateRendererSize();
};

updateRendererSize();
container.appendChild(renderer.domElement);

var lastReferenceImage = "";
var lastDepthMap = "";
var needUpdate = false;

function frameUpdate() {
    var referenceImage = visualizer.getAttribute("reference_image");
    var depthMap = visualizer.getAttribute("depth_map");
    if (referenceImage == lastReferenceImage && depthMap == lastDepthMap) {
        if (needUpdate) {
            if (isQuiltsMode) {
                updateQuilts();
            } else {
                controls.update();
            }
            renderer.render(scene, camera);
            updateDistanceDisplay();
            updateRotationDisplay();
        }
        requestAnimationFrame(frameUpdate);
    } else {
        needUpdate = false;
        scene.clear();
        progressDialog.open = true;
        lastReferenceImage = referenceImage;
        lastDepthMap = depthMap;
        main(JSON.parse(lastReferenceImage), JSON.parse(lastDepthMap));
    }
}

const onProgress = function (xhr) {
    if (xhr.lengthComputable) {
        progressIndicator.value = xhr.loaded / xhr.total * 100;
    }
};

const onError = function (e) {
    console.error(e);
};

// 修改自适应回正函数
function resetView(depthStrength) {
    const maxDisplacement = 2.5 * depthStrength;
    
    // 计算基于FOV的相机回正距离补偿
    const fovRadians = THREE.MathUtils.degToRad(camera.fov);
    const fovCompensation = 1 / Math.tan(fovRadians / 2);
    
    // 基础距离 * FOV补偿系数
    const cameraDistance = (BASE_CAMERA_DISTANCE* fovCompensation) + (maxDisplacement * 0.5) + currentZOffset ;
    
    // 重置相机位置和旋转
    camera.position.set(0, 0, cameraDistance);
    camera.rotation.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    updateDistanceDisplay();
    updateRotationDisplay();
}

async function main(referenceImageParams, depthMapParams) {
    let referenceTexture, depthTexture;
    let imageWidth = 10;
    let imageHeight = 10;

    // 清除现有场景内容
    scene.clear();
    
    // 重新添加基础场景元素
    scene.background = new THREE.Color(0x000000);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(renderer), 0.04).texture;
    
    // 添加中心点标记
    const centerPoint = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 16),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    centerPoint.name = 'centerPoint';
    scene.add(centerPoint);

    // 添加坐标轴
    const axesHelper = new THREE.AxesHelper(5);
    axesHelper.name = 'axesHelper';
    scene.add(axesHelper);

    // 添加环境光和相机
    scene.add(ambientLight);
    scene.add(camera);

    if (referenceImageParams?.filename) {
        const referenceImageUrl = `${apiURL}/view?` + new URLSearchParams(referenceImageParams).toString();
        const referenceImageExt = referenceImageParams.filename.slice(referenceImageParams.filename.lastIndexOf(".") + 1);

        if (referenceImageExt === "png" || referenceImageExt === "jpg" || referenceImageExt === "jpeg") {
            const referenceImageLoader = new THREE.TextureLoader();
            referenceTexture = await new Promise((resolve, reject) => {
                referenceImageLoader.load(referenceImageUrl, (texture) => {
                    imageWidth = 10;
                    imageHeight = texture.image.height / (texture.image.width / 10);
                    resolve(texture);
                }, undefined, reject);
            });
        }
    }

    if (depthMapParams?.filename) {
        const depthMapUrl = `${apiURL}/view?` + new URLSearchParams(depthMapParams).toString();
        const depthMapExt = depthMapParams.filename.slice(depthMapParams.filename.lastIndexOf(".") + 1);

        if (depthMapExt === "png" || depthMapExt === "jpg" || depthMapExt === "jpeg") {
            const depthMapLoader = new THREE.TextureLoader();
            depthTexture = await depthMapLoader.loadAsync(depthMapUrl);
        }
    }

    if (referenceTexture && depthTexture) {
        if (currentDepthMesh) {
            scene.remove(currentDepthMesh);
            currentDepthMesh.geometry.dispose();
            currentDepthMesh.material.dispose();
        }

        const depthMaterial = new THREE.ShaderMaterial({
            uniforms: {
                referenceTexture: { value: referenceTexture },
                depthTexture: { value: depthTexture },
                depthScale: { value: 5.0 * currentDepthStrength },
                dofStrength: { value: currentDofStrength },
                focusDistance: { value: currentFocusDistance },
                ambientLightColor: { value: new THREE.Color(0.2, 0.2, 0.2) },
                lightPosition: { value: new THREE.Vector3(2, 2, 2) },
                lightColor: { value: new THREE.Color(1, 1, 1) },
                lightIntensity: { value: 1.0 },
                shininess: { value: 30 },
            },
            vertexShader: `
                uniform sampler2D depthTexture;
                uniform float depthScale;
        
                varying vec2 vUv;
                varying float vDepth;
                varying vec3 vNormal;
                varying vec3 vViewPosition;
        
                void main() {
                    vUv = uv;
                    
                    float depth = texture2D(depthTexture, uv).r;
                    vec3 displacement = normal * depth * depthScale;
                    vec3 displacedPosition = position + displacement;
                    
                    vec4 worldPosition = modelMatrix * vec4(displacedPosition, 1.0);
                    vNormal = normalize(normalMatrix * normal);
                    vViewPosition = (viewMatrix * worldPosition).xyz;
                    
                    gl_Position = projectionMatrix * viewMatrix * worldPosition;
                    
                    vDepth = depth;
                }
            `,
            fragmentShader: `
                uniform sampler2D referenceTexture;
                uniform float dofStrength;
                uniform float focusDistance;
        
                varying vec2 vUv;
                varying float vDepth;
                varying vec3 vViewPosition;

                // 优化的高斯模糊采样函数
                vec4 gaussianBlur(sampler2D tex, vec2 uv, float blurFactor) {
                    vec4 color = vec4(0.0);
                    float total = 0.0;
                    
                    // 使用高斯函数计算权重
                    float sigma = 4.0; // 控制高斯分布的宽度
                    float weights[8];
                    float offsets[8];
                    
                    // 计算权重和偏移
                    for(int i = 0; i < 8; i++) {
                        offsets[i] = float(i);
                        // 高斯函数: exp(-(x^2)/(2*sigma^2))
                        weights[i] =0.005 + exp(-(float(i) * float(i)) / (2.0 * sigma * sigma));
                    }
                    
                    // 水平方向
                    for(int i = 0; i < 8; i++) {
                        float offset = offsets[i] * blurFactor * 0.005;
                        color += texture2D(tex, uv + vec2(offset, 0.0)) * weights[i];
                        color += texture2D(tex, uv - vec2(offset, 0.0)) * weights[i];
                        total += weights[i] * 2.0;
                    }
                    
                    // 垂直方向
                    vec4 color2 = vec4(0.0);
                    for(int i = 0; i < 8; i++) {
                        float offset = offsets[i] * blurFactor * 0.005;
                        color2 += texture2D(tex, uv + vec2(0.0, offset)) * weights[i];
                        color2 += texture2D(tex, uv - vec2(0.0, offset)) * weights[i];
                        total += weights[i] * 2.0;
                    }
                    
                    return (color + color2) / total;
                }
        
                void main() {
                    vec4 referenceColor = texture2D(referenceTexture, vUv);
                    
                    // 计算景深模糊
                    float depthDiff = abs(vDepth - focusDistance);
                    float blurFactor = pow(depthDiff, (0.25 - (0.05 * dofStrength)) ) * dofStrength; 
                    
                    // 应用优化后的高斯模糊
                    vec4 blurredColor = gaussianBlur(referenceTexture, vUv, blurFactor);
                    
                    // 调整亮度
                    blurredColor.rgb *= 0.99; // 略微降低亮度
                    
                    // 混合原始颜色和模糊颜色
                    gl_FragColor = mix(referenceColor, blurredColor, blurFactor);
                }
            `
        });
    
        const planeGeometry = new THREE.PlaneGeometry(imageWidth, imageHeight, 360, 360);
        currentDepthMesh = new THREE.Mesh(planeGeometry, depthMaterial);
        // 设置初始Z轴偏移时也要考虑深度强度
        const finalZOffset = currentZOffset - (currentDepthStrength * 5 / 2);
        currentDepthMesh.position.z = finalZOffset;
        scene.add(currentDepthMesh);

        // 只在初始化时重置相机位置
        if (!needUpdate) {
            resetView(currentDepthStrength);
        }
    }

    needUpdate = true;

    scene.add(ambientLight);
    scene.add(camera);

    progressDialog.close();

    frameUpdate();
}

document.getElementById('screenshotButton').addEventListener('click', takeScreenshot);

// 修改截图函数
function takeScreenshot() {
    const originalSize = {
        width: renderer.domElement.width,
        height: renderer.domElement.height
    };

    // 临时移除坐标轴和中心点
    const axesHelper = scene.getObjectByName('axesHelper');
    const centerPoint = scene.getObjectByName('centerPoint');
    if (axesHelper) {
        scene.remove(axesHelper);
    }
    if (centerPoint) {
        scene.remove(centerPoint);
    }

    // 设置高分辨率
    renderer.setSize(currentScreenshotSize, currentScreenshotSize);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    // 获取截图
    const dataURL = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `screenshot_${currentScreenshotSize}x${currentScreenshotSize}.png`;
    link.click();

    // 恢复原始尺寸和重新添加坐标轴和中心点
    renderer.setSize(originalSize.width, originalSize.height);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    if (axesHelper) {
        scene.add(axesHelper);
    }
    if (centerPoint) {
        scene.add(centerPoint);
    }
    renderer.render(scene, camera);
}

// Quilts功能实现
function startQuilts() {
    isQuiltsMode = true;
    quiltsProgress = 0;
    quiltsStartTime = Date.now();
    quiltsCurrentFrame = 0;
    quiltsIsRotating = true;
    controls.enabled = false; // 禁用控制器
    
    // 清空之前的截图
    quiltsScreenshots = [];
    
    // 保存当前相机位置
    const currentY = camera.position.y;
    const currentZ = camera.position.z;
    const currentX = camera.position.x;
    const radius = Math.sqrt(currentX * currentX + currentZ * currentZ);
    
    // 计算起始和结束角度
    const halfAngleRange = currentQuiltsAngleRange / 2;
    const quiltsStartRotation = halfAngleRange;
    const quiltsEndRotation = -halfAngleRange;
    
    // 计算第一个目标角度
    const totalFrames = currentQuiltsNum;
    const angleStep = (quiltsEndRotation - quiltsStartRotation) / (totalFrames - 1);
    quiltsTargetRotation = quiltsStartRotation;
    
    // 设置初始位置
    const radian = THREE.MathUtils.degToRad(quiltsStartRotation);
    const x = Math.sin(radian) * radius;
    const z = Math.cos(radian) * radius;
    camera.position.set(x, currentY, z);
    camera.lookAt(0, 0, 0);
    controls.update();
}

function stopQuilts() {
    isQuiltsMode = false;
    quiltsIsRotating = false;
    controls.enabled = true; // 启用控制器

    // 获取当前iframe的ID
    const urlParams = new URLSearchParams(window.location.search);
    const iframeId = urlParams.get('id');

    // 发送所有截图给父窗口
    if (quiltsScreenshots.length > 0) {
        window.parent.postMessage({
            type: 'quiltsComplete',
            imgs: quiltsScreenshots,
            id: iframeId
        }, '*');
        
        // 清空截图数组
        quiltsScreenshots = [];
    }
}

function updateQuilts() {
    if (!isQuiltsMode) return;

    const currentTime = Date.now();
    const elapsed = currentTime - quiltsStartTime;
    quiltsProgress = Math.min(elapsed / QUILTS_DURATION, 1);

    if (quiltsIsRotating) {
        // 计算当前旋转角度
        const totalFrames = currentQuiltsNum;
        const halfAngleRange = currentQuiltsAngleRange / 2;
        const quiltsStartRotation = halfAngleRange;
        const quiltsEndRotation = -halfAngleRange;
        const angleStep = (quiltsEndRotation - quiltsStartRotation) / (totalFrames - 1);
        const targetRotation = quiltsStartRotation + (angleStep * quiltsCurrentFrame);
        
        // 使用相机绕物体旋转，保持水平旋转半径不变
        const currentX = camera.position.x;
        const currentZ = camera.position.z;
        const radius = Math.sqrt(currentX * currentX + currentZ * currentZ); // 计算当前水平旋转半径
        const currentAngle = THREE.MathUtils.radToDeg(Math.atan2(currentX, currentZ));
        const targetAngle = targetRotation;
        const newAngle = currentAngle + (targetAngle - currentAngle) * quiltsProgress;
        
        // 更新相机位置，保持水平旋转半径不变
        const radian = THREE.MathUtils.degToRad(newAngle);
        const x = Math.sin(radian) * radius;
        const z = Math.cos(radian) * radius;
        
        // 保持Y坐标不变
        const currentY = camera.position.y;
        camera.position.set(x, currentY, z);
        camera.lookAt(0, 0, 0);
        controls.update();

        if (quiltsProgress >= 1) {
            // 完成当前角度的旋转
            quiltsIsRotating = false;
            takeQuiltsScreenshot();
            
            // 准备下一个角度
            quiltsCurrentFrame++;
            if (quiltsCurrentFrame < currentQuiltsNum) {
                quiltsProgress = 0;
                quiltsStartTime = currentTime;
                quiltsIsRotating = true;
            } else {
                stopQuilts();
            }
        }
    }
}

// 修改Quilts截图功能
async function takeQuiltsScreenshot() {
    const originalSize = {
        width: renderer.domElement.width,
        height: renderer.domElement.height
    };

    // 临时移除坐标轴和中心点
    const axesHelper = scene.getObjectByName('axesHelper');
    const centerPoint = scene.getObjectByName('centerPoint');
    if (axesHelper) {
        scene.remove(axesHelper);
    }
    if (centerPoint) {
        scene.remove(centerPoint);
    }

    // 确保在截图前完成渲染
    renderer.setSize(currentScreenshotSize, currentScreenshotSize);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    // 获取截图数据
    const dataURL = renderer.domElement.toDataURL('image/png');
    quiltsScreenshots.push(dataURL);

    // 恢复原始尺寸和重新添加坐标轴和中心点
    renderer.setSize(originalSize.width, originalSize.height);
    camera.aspect = 1;
    camera.updateProjectionMatrix();
    if (axesHelper) {
        scene.add(axesHelper);
    }
    if (centerPoint) {
        scene.add(centerPoint);
    }
    renderer.render(scene, camera);
}

// 更新旋转信息显示函数
function updateRotationDisplay() {
    // 从相机获取旋转信息
    const rotation = camera.rotation;
    const euler = new THREE.Euler().setFromQuaternion(camera.quaternion);
    const degrees = {
        x: THREE.MathUtils.radToDeg(euler.x).toFixed(1),
        y: THREE.MathUtils.radToDeg(euler.y).toFixed(1),
        z: THREE.MathUtils.radToDeg(euler.z).toFixed(1)
    };
    rotationDisplay.textContent = `Rotation: X:${degrees.x}° Y:${degrees.y}° Z:${degrees.z}°`;
}
