import { app } from "../../scripts/app.js"
import { api } from '../../scripts/api.js'
import { config } from './config.js'

// 等待 config 加载完成
let configLoaded = false;
const waitForConfig = () => {
    if (config && config.defaults) {
        configLoaded = true;
        return true;
    }
    return false;
}

// 初始化函数
const initializeVisualizer = () => {
    if (!waitForConfig()) {
        console.log('[Visualizer] Waiting for config to load...');
        setTimeout(initializeVisualizer, 100);
        return;
    }
    
    console.log('[Visualizer] Config loaded, initializing...');
    
    app.registerExtension({
        name: config.extensionName,
        async beforeRegisterNodeDef(nodeType, nodeData, app) {
            registerVisualizer(nodeType, nodeData, config.node.name, 'threeVisualizer')
        },
        nodeCreated(node, app) {
            console.log('[DepthViewerAndQuilts] Node created:', node.id)
            
            setTimeout(() => {
                let widget = node.widgets?.filter(w => w.name == 'previewRGBD')[0]
                let framesWidget = node.widgets?.filter(w => w.name == 'frames')[0]
        
                console.log('[DepthViewerAndQuilts] Widgets found:', {
                    preview3d: !!widget,
                    frames: !!framesWidget
                })
        
                if (node.type === 'DepthViewerAndQuilts' && widget) {
                    let nodeId = node.id
                    console.log('[DepthViewerAndQuilts] Setting up iframe for node:', nodeId)
                    
                    //延迟才能获得this.id
                    widget.visualizer.querySelector('iframe').src += '?id=' + nodeId
                    console.log('[DepthViewerAndQuilts] iframe src updated:', widget.visualizer.querySelector('iframe').src)
                    
                    // 添加消息监听器
                    window.addEventListener('message', async event => {
                        console.log('[DepthViewerAndQuilts] Message received:', {
                            source: event.source,
                            origin: event.origin,
                            data: event.data
                        })
                        
                        try {
                            // 检查消息的来源，确保消息来自可信的源
                            if (!event.data || !event.data.id || !event.data.imgs) {
                                console.error('[DepthViewerAndQuilts] Invalid message format:', event.data)
                                return
                            }
            
                            const { id, imgs } = event.data
                            console.log('[DepthViewerAndQuilts] Processing message:', {
                                receivedId: id,
                                nodeId: nodeId,
                                imagesCount: imgs?.length
                            })
                            
                            // 验证节点ID - 转换为相同类型进行比较
                            if (String(id) !== String(nodeId)) {
                                console.log('[DepthViewerAndQuilts] Message ID mismatch:', {
                                    received: id,
                                    expected: nodeId,
                                    receivedType: typeof id,
                                    expectedType: typeof nodeId
                                })
                                return
                            }
            
                            // 初始化frames控件
                            framesWidget.value = { images: [] }
                            console.log('[DepthViewerAndQuilts] Frames widget initialized')
            
                            // 处理每张图片
                            for (let i = 0; i < imgs.length; i++) {
                                const base64Image = imgs[i]
                                try {
                                    console.log(`[DepthViewerAndQuilts] Processing image ${i + 1}/${imgs.length}`)
                                    
                                    // 验证base64数据
                                    if (!base64Image || typeof base64Image !== 'string') {
                                        console.error(`[DepthViewerAndQuilts] Invalid base64 data for image ${i + 1}`)
                                        continue
                                    }
            
                                    // 上传图片并获取URL
                                    console.log(`[DepthViewerAndQuilts] Uploading image ${i + 1}`)
                                    const file = await uploadBase64ToFile(base64Image)
                                    
                                    // 验证返回的文件数据
                                    if (!file || !file.name) {
                                        console.error(`[DepthViewerAndQuilts] Invalid file data for image ${i + 1}:`, file)
                                        continue
                                    }
            
                                    console.log(`[DepthViewerAndQuilts] Image ${i + 1} uploaded successfully:`, file.name)
                                    
                                    // 添加到frames控件
                                    framesWidget.value.images.push(file)
                                } catch (error) {
                                    console.error(`[DepthViewerAndQuilts] Error processing image ${i + 1}:`, error)
                                }
                            }
            
                            // 触发更新
                            framesWidget.value._seed = Math.random()
                            node.title = 'Input #' + framesWidget.value.images.length
                            console.log('[DepthViewerAndQuilts] Update completed:', {
                                imagesCount: framesWidget.value.images.length,
                                newTitle: node.title
                            })
            
                            // 触发节点更新
                            node.setDirtyCanvas(true, true)
                            console.log('[DepthViewerAndQuilts] Canvas marked as dirty')
                        } catch (error) {
                            console.error('[DepthViewerAndQuilts] Error in message handler:', error)
                        }
                    })
                    
                    console.log('[DepthViewerAndQuilts] Message listener setup completed')
                }
            }, 1000)
        }
    });
}

// 启动初始化
initializeVisualizer();

function base64ToBlobFromURL (base64URL, contentType) {
    return fetch(base64URL).then(response => response.blob())
}

async function uploadImage (blob, fileType = '.svg', filename) {
    // const blob = await (await fetch(src)).blob();
    const body = new FormData()
    body.append(
        'image',
        new File([blob], (filename || new Date().getTime()) + fileType)
    )

    const resp = await api.fetchApi('/upload/image', {
        method: 'POST',
        body
    })

    // console.log(resp)
    let data = await resp.json()

    return data
}

// 上传得到url
async function uploadBase64ToFile (base64) {
    let bg_blob = await base64ToBlobFromURL(base64)
    let url = await uploadImage(bg_blob, '.png')
    return url
}

class Visualizer {
    constructor(node, container, visualSrc) {
        this.node = node
        console.log('[Visualizer] Creating visualizer for node:', node.id)

        this.iframe = document.createElement('iframe')
        Object.assign(this.iframe, {
            scrolling: "no",
            overflow: "hidden",
        })
        
        // 使用配置文件中的路径
        this.iframe.src = `${config.paths.html}/${visualSrc}.html`
        console.log('[Visualizer] iframe src:', this.iframe.src);
        
        container.appendChild(this.iframe)

        // 使用配置的默认值
        this.depthStrength = config.defaults.depthStrength;
        this.dofStrength = config.defaults.dofStrength;
        this.focusDistance = config.defaults.focusDistance;

        // 创建控制面板容器
        this.controlPanel = document.createElement('div')
        this.controlPanel.style.cssText = `
            position: absolute;
            top: 10px;
            right: 10px;
            width: ${config.controlPanel.width}px;
            background: ${config.controlPanel.background};
            padding: ${config.controlPanel.padding}px;
            border-radius: ${config.controlPanel.borderRadius}px;
            z-index: ${config.controlPanel.zIndex};
            display: flex;
            flex-direction: column;
            gap: 10px;
            transform-origin: top right;
            transform: scale(${config.controlPanel.defaultScale});
        `

        // 添加自适应缩放
        const updateControlPanelScale = () => {
            const containerWidth = this.iframe.clientWidth;
            const containerHeight = this.iframe.clientHeight;
            const minDimension = Math.min(containerWidth, containerHeight);
            
            let scale = config.controlPanel.defaultScale;
            for (const [size, settings] of Object.entries(config.controlPanel.scales)) {
                if (minDimension >= settings.minDimension) {
                    scale = settings.scale;
                    break;
                }
            }
            
            this.controlPanel.style.transform = `scale(${scale})`;
        }

        // 监听iframe大小变化
        const resizeObserver = new ResizeObserver(() => {
            updateControlPanelScale();
        });
        resizeObserver.observe(this.iframe);

        // 回正按钮
        const resetButton = document.createElement('button')
        resetButton.textContent = config.buttons.resetView.text
        resetButton.style.cssText = Object.entries(config.buttons.resetView.style)
            .map(([key, value]) => `${key}: ${value}`)
            .join(';')
        resetButton.onclick = () => {
            this.iframe.contentWindow.postMessage({
                type: 'resetView',
                depthStrength: this.depthStrength
            }, '*')
        }
        this.controlPanel.appendChild(resetButton)

        // 深度强度控制
        const depthControl = this.createSliderControl(
            'depthStrength',
            config.sliders.depthStrength,
            (value) => {
                this.depthStrength = value;
                this.updateVisual({
                    reference_image: this.currentReferenceImage,
                    depth_map: this.currentDepthMap
                });
            }
        );

        // 景深控制
        const dofControl = this.createSliderControl(
            'dofStrength',
            config.sliders.dofStrength,
            (value) => {
                this.dofStrength = value;
                this.updateVisual({
                    reference_image: this.currentReferenceImage,
                    depth_map: this.currentDepthMap
                });
            }
        );

        // 对焦点控制
        const focusControl = this.createSliderControl(
            'focusDistance',
            config.sliders.focusDistance,
            (value) => {
                this.focusDistance = value;
                this.updateVisual({
                    reference_image: this.currentReferenceImage,
                    depth_map: this.currentDepthMap
                });
            }
        );

        // Z轴偏移控制
        const zOffsetControl = this.createSliderControl(
            'zOffset',
            config.sliders.zOffset,
            (value) => {
                this.iframe.contentWindow.postMessage({
                    type: 'updateZOffset',
                    value: value
                }, '*');
            }
        );

        this.controlPanel.appendChild(depthControl)
        this.controlPanel.appendChild(dofControl)
        this.controlPanel.appendChild(focusControl)
        this.controlPanel.appendChild(zOffsetControl)

        // 添加Quilts控制
        const quiltsControl = document.createElement('div')
        quiltsControl.style.cssText = `
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid rgba(255, 255, 255, 0.2);
        `

        // Quilts数量控制
        const quiltsNumControl = this.createSliderControl(
            'quiltsNum',
            config.sliders.quiltsNum,
            (value) => {
                this.iframe.contentWindow.postMessage({
                    type: 'updateQuiltsNum',
                    value: value
                }, '*');
            }
        );

        // Quilt角度差控制
        const angleRangeControl = this.createSliderControl(
            'quiltsAngleRange',
            config.sliders.quiltsAngleRange,
            (value) => {
                this.iframe.contentWindow.postMessage({
                    type: 'updateQuiltsAngleRange',
                    value: value
                }, '*');
            }
        );

        // 截图分辨率控制
        const resolutionControl = this.createSliderControl(
            'screenshotSize',
            config.sliders.screenshotSize,
            (value) => {
                const size = 512 * Math.pow(2, value);  // 计算实际分辨率
                this.iframe.contentWindow.postMessage({
                    type: 'updateScreenshotSize',
                    value: size
                }, '*');
            }
        );

        // Quilts开始/停止按钮
        const quiltsButton = document.createElement('button')
        quiltsButton.textContent = config.buttons.quiltsCapture.text
        quiltsButton.style.cssText = Object.entries(config.buttons.quiltsCapture.style)
            .map(([key, value]) => `${key}: ${value}`)
            .join(';')
        
        quiltsButton.onclick = () => {
            this.iframe.contentWindow.postMessage({
                type: 'toggleQuilts'
            }, '*')
        }

        quiltsControl.appendChild(quiltsNumControl)
        quiltsControl.appendChild(angleRangeControl)
        quiltsControl.appendChild(resolutionControl)
        quiltsControl.appendChild(quiltsButton)
        this.controlPanel.appendChild(quiltsControl)

        container.appendChild(this.controlPanel)

        // Wait for the iframe to load, then initialize it with the API URL
        this.iframe.onload = () => {
            updateControlPanelScale();
            this.iframe.contentWindow.postMessage({
                type: 'init',
                apiURL: app.getApiUrl()
            }, '*')
        }
    }

    // 创建滑块控制的辅助方法
    createSliderControl(name, settings, onChange) {
        const control = document.createElement('div')
        
        // 获取默认值
        const defaultValue = config.defaults[name] !== undefined ? config.defaults[name] : (settings.values ? settings.values[0] : settings.min)
        
        const label = document.createElement('label')
        // 对于截图分辨率，显示实际的分辨率值
        if (name === 'screenshotSize') {
            const actualSize = 512 * Math.pow(2, defaultValue);
            label.textContent = `${settings.label}: ${actualSize}`
        } else {
            label.textContent = `${settings.label}: ${defaultValue}${settings.label.includes('角度') ? '°' : ''}`
        }
        label.style.color = 'white'
        label.style.display = 'inline-block'
        label.style.marginBottom = '5px'
        label.style.width = '120px'
        
        const resetBtn = document.createElement('button')
        resetBtn.textContent = '重置'
        resetBtn.style.cssText = `
            padding: 2px 8px;
            background: rgba(255, 255, 255, 0.1);
            color: white;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            cursor: pointer;
            margin-left: 5px;
            width: 45px;
        `
        
        const slider = document.createElement('input')
        slider.type = 'range'
        slider.min = settings.min
        slider.max = settings.max
        slider.step = settings.step
        slider.value = defaultValue
        slider.style.width = '100%'
        slider.style.display = 'block'
        slider.style.marginTop = '5px'
        
        slider.oninput = (e) => {
            const value = parseFloat(e.target.value);
            if (name === 'screenshotSize') {
                const actualSize = 512 * Math.pow(2, value);
                label.textContent = `${settings.label}: ${actualSize}`
            } else {
                label.textContent = `${settings.label}: ${value}${settings.label.includes('角度') ? '°' : ''}`
            }
            onChange(value)
        }
        
        resetBtn.onclick = () => {
            slider.value = defaultValue
            if (name === 'screenshotSize') {
                const actualSize = 512 * Math.pow(2, defaultValue);
                label.textContent = `${settings.label}: ${actualSize}`
            } else {
                label.textContent = `${settings.label}: ${defaultValue}${settings.label.includes('角度') ? '°' : ''}`
            }
            onChange(defaultValue)
        }
        
        control.appendChild(label)
        control.appendChild(resetBtn)
        control.appendChild(slider)
        
        return control
    }

    updateVisual(params) {
        this.currentReferenceImage = params.reference_image
        this.currentDepthMap = params.depth_map
        
        const iframeDocument = this.iframe.contentWindow.document;
        const previewScript = iframeDocument.getElementById('visualizer');
        previewScript.setAttribute("reference_image", JSON.stringify(params.reference_image));
        previewScript.setAttribute("depth_map", JSON.stringify(params.depth_map));
        // Trigger the update in the iframe
        this.iframe.contentWindow.postMessage({
            type: 'update',
            referenceImage: params.reference_image,
            depthMap: params.depth_map,
            depthStrength: this.depthStrength,
            dofStrength: this.dofStrength,
            focusDistance: this.focusDistance
        }, '*')
    }

    remove() {
        this.container.remove()
    }
}

function createVisualizer(node, inputName, typeName, inputData, app) {
    node.name = inputName

    const widget = {
        type: typeName,
        name: "previewRGBD",
        callback: () => {},
        draw : function(ctx, node, widgetWidth, widgetY, widgetHeight) {
            const margin = 10
            const top_offset = 5
            const base_offset = 30  // 基础偏移值
            const scale = app.canvas.ds.scale  // 获取当前缩放比例
            const right_offset = 90 - base_offset * scale  // 根据缩放比例计算实际偏移
            const visible = app.canvas.ds.scale > 0.5 && this.type === typeName
            const w = widgetWidth - margin * 4
            const clientRectBound = ctx.canvas.getBoundingClientRect()
            const transform = new DOMMatrix()
                .scaleSelf(
                    clientRectBound.width / ctx.canvas.width,
                    clientRectBound.height / ctx.canvas.height
                )
                .multiplySelf(ctx.getTransform())
                .translateSelf(margin + right_offset, margin + widgetY +20)
            
            Object.assign(this.visualizer.style, {
                left: `${transform.a * margin + transform.e}px`,
                top: `${transform.d + transform.f + top_offset}px`,
                width: `${(w * transform.a)}px`,
                height: `${(w * transform.d - widgetHeight - (margin * 15) * transform.d)}px`,
                position: "absolute",
                overflow: "hidden",
                zIndex: app.graph._nodes.indexOf(node),
            })

            Object.assign(this.visualizer.children[0].style, {
                transformOrigin: "50% 50%",
                width: '100%',
                height: '100%',
                border: '0 none',
            })

            this.visualizer.hidden = !visible
        },
    }

    const container = document.createElement('div')
    container.id = `Comfy3D_${inputName}`

    node.visualizer = new Visualizer(node, container, typeName)
    widget.visualizer = container
    widget.parent = node

    document.body.appendChild(widget.visualizer)

    node.addCustomWidget(widget)

    node.updateParameters = (params) => {
        params.id = node.id
        node.visualizer.updateVisual(params);
    }


    // Events for drawing backgound
    node.onDrawBackground = function (ctx) {
        if (!this.flags.collapsed) {
            node.visualizer.iframe.hidden = false
        } else {
            node.visualizer.iframe.hidden = true
        }
    }

    // Make sure visualization iframe is always inside the node when resize the node
    node.onResize = function () {
        let [w, h] = this.size
        if (w <= 600) w = 600
        if (h <= 500) h = 500

        if (w > 600) {
            h = w - 100
        }

        this.size = [w, h]
    }

    // Events for remove nodes
    node.onRemoved = () => {
        for (let w in node.widgets) {
            if (node.widgets[w].visualizer) {
                node.widgets[w].visualizer.remove()
            }
        }
    }

    return {
        widget: widget,
    }
}

function registerVisualizer(nodeType, nodeData, nodeClassName, typeName) {
    if (nodeData.name == nodeClassName) {
        console.log("[3D Visualizer] Registering node: " + nodeData.name)

        const onNodeCreated = nodeType.prototype.onNodeCreated

        nodeType.prototype.onNodeCreated = async function() {
            const r = onNodeCreated
                ? onNodeCreated.apply(this, arguments)
                : undefined

            let PreviewRGBD = app.graph._nodes.filter(
                (wi) => wi.type == nodeClassName
            )
            let nodeName = `PreviewRGBD_${PreviewRGBD.length}`

            console.log(`[Comfy3D] Create: ${nodeName}`)

            const result = await createVisualizer.apply(this, [this, nodeName, typeName, {}, app])

            this.setSize([600, 500])

            return r
        }

        nodeType.prototype.onExecuted = async function(message) { 
                // Check if reference image and depth map are available
            console.log('#message', message)
            if (message.reference_image && message.depth_map) {
                const params = {}
                params.reference_image = message.reference_image[0];
                params.depth_map = message.depth_map[0];
                this.updateParameters(params);
            }
                
         }
    }
}
  