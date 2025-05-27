// Main configuration file for Depth Visualization extension 深度可视化扩展的主配置文件
const extension = '/extensions/ComfyUI-Depth-Visualization-advanced';

export const config = {
    // Base paths for extension files 扩展文件的基础路径
    paths: {
        extension,
        html: extension + '/html'
    },

    // Extension identifier 扩展标识符
    extensionName: 'ORANGESILVER.DepthViewerAndQuilts',

    // Node display settings 节点显示设置
    node: {
        name: 'DepthViewerAndQuilts',
        defaultSize: [600, 500],
        minSize: {
            width: 600,
            height: 500
        }
    },

    // UI control panel settings UI控制面板设置
    controlPanel: {
        width: 200,
        background: 'rgba(0, 0, 0, 0.7)',
        padding: 10,
        borderRadius: 5,
        zIndex: 1000,
        defaultScale: 0.75,
        scales: {
            large: {
                minDimension: 800,
                scale: 1.25
            },
            medium: {
                minDimension: 600,
                scale: 1.0
            },
            small: {
                minDimension: 400,
                scale: 0.6
            },
            tiny: {
                minDimension: 300,
                scale: 0.5
            }
        }
    },

    // Initial values for parameter 参数初始值
    defaults: {
        depthStrength: 1.5,
        dofStrength: 0.5,
        focusDistance: 0.95,
        zOffset: 0.0,
        quiltsNum: 4,
        quiltsAngleRange: 14,
        screenshotSize: 1,  // 0 代表 512 * 2^0 = 512
        cameraFOV: 7,
    },

    // Slider control settings 滑块控制设置
    sliders: {
        depthStrength: {
            min: 0,
            max: 2,
            step: 0.1,
            label: '深度强度'
        },
        dofStrength: {
            min: 0,
            max: 1,
            step: 0.1,
            label: '景深强度'
        },
        focusDistance: {
            min: 0,
            max: 1,
            step: 0.01,
            label: '对焦点'
        },
        zOffset: {
            min: -5,
            max: 5,
            step: 0.1,
            label: '轴心偏移'
        },
        cameraFOV: {
            min: 5,  // 修改最小值为5度
            max: 120,
            step: 1,
            label: '相机FOV角'
        },
        quiltsNum: {
            min: 1,
            max: 48,
            step: 1,
            label: 'Quilts数量'
        },
        quiltsAngleRange: {
            min: 2,
            max: 180,
            step: 1,
            label: 'Quilt角度差'
        },
        screenshotSize: {
            min: 0,
            max: 3,  // 0:512, 1:1024, 2:2048, 3:4096
            step: 1,
            label: '截图分辨率',
            getValue: (index) => 512 * Math.pow(2, index)  // 计算实际分辨率
        }
    },

    // Button appearance and text 按钮外观和文本
    buttons: {
        resetView: {
            text: '回正视图',
            style: {
                padding: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%',
                marginBottom: '10px'
            }
        },
        quiltsCapture: {
            text: '开始QuiltsCapture',
            style: {
                padding: '8px',
                background: 'rgba(255, 255, 255, 0.1)',
                color: 'white',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                cursor: 'pointer',
                width: '100%',
                marginTop: '10px'
            }
        }
    }
}; 