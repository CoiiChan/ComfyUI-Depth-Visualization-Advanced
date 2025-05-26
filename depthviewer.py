import sys
import torch
import os
from os import path

sys.path.insert(0, path.dirname(__file__))
import folder_paths
from PIL import Image
import numpy as np
import comfy.utils

# Convert PIL to Tensor
def pil2tensor(image):
    return torch.from_numpy(np.array(image).astype(np.float32) / 255.0).unsqueeze(0)

def load_image_to_tensor(image_path):
    """
    加载图片并转换为tensor
    """
    #print(f"[DepthViewerAndQuilts] Attempting to load image: {image_path}")
    
    # 获取ComfyUI根目录
    root_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    # 构建完整的输入目录路径
    input_dir = os.path.join(root_dir, "input")
    
    # 检查文件是否存在
    full_path = os.path.join(input_dir, image_path.split(' [')[0])
    if not os.path.exists(full_path):
        print(f"[DepthViewerAndQuilts] File not found: {full_path}")
        raise FileNotFoundError(f"Image file not found: {full_path}")
    
    
    try:
        # 加载图片
        image = Image.open(full_path)
        # 转换为RGB模式（如果是RGBA，去除alpha通道）
        if image.mode == 'RGBA':
            image = image.convert('RGB')
        # 转换为tensor
        tensor = pil2tensor(image)
        return tensor, None
    except Exception as e:
        print(f"[DepthViewerAndQuilts] Error loading image {full_path}: {str(e)}")
        raise

class DepthViewerAndQuilts:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "depth_map": ("IMAGE",),
            },
             "optional":{
                  "frames":("IMAGEBASE64",), 
                },
        }

    def __init__(self):
        self.saved_reference = []
        self.saved_depth = []

        self.full_output_folder,self.filename,self.counter, self.subfolder, self.filename_prefix = folder_paths.get_save_image_path(
            "imagesave", 
            folder_paths.get_output_directory())

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("cache_frames",)
    
    OUTPUT_NODE = True

    INPUT_IS_LIST = False
    OUTPUT_IS_LIST = (False,)

    FUNCTION = "run"
    CATEGORY = "DepthViewerAndQuilts"
    def run(self, image, depth_map,frames=None):
        self.saved_reference.clear()
        self.saved_depth.clear()
        image = image[0].detach().cpu().numpy()
        depth = depth_map[0].detach().cpu().numpy()

        image = Image.fromarray(np.clip(255. * image, 0, 255).astype(np.uint8)).convert('RGB')
        depth = Image.fromarray(np.clip(255. * depth, 0, 255).astype(np.uint8))

        return self.display([image], [depth],frames)

    def display(self, reference_image, depth_map,frames):
        for (batch_number, (single_image, single_depth)) in enumerate(zip(reference_image, depth_map)):
            filename_with_batch_num = self.filename.replace("%batch_num%", str(batch_number))

            image_file = f"{filename_with_batch_num}_{self.counter:05}_reference.png"
            single_image.save(os.path.join(self.full_output_folder, image_file))

            depth_file = f"{filename_with_batch_num}_{self.counter:05}_depth.png"
            single_depth.save(os.path.join(self.full_output_folder, depth_file))

            self.saved_reference.append({
                "filename": image_file,
                "subfolder": self.subfolder,
                "type": "output"
            })

            self.saved_depth.append({
                "filename": depth_file,
                "subfolder": self.subfolder,
                "type": "output"
            })
            self.counter += 1


        ims=[]
        image1 = Image.new('RGB', (512, 512), color='black')
        image1=pil2tensor(image1)

        # print('frames',frames)
        if frames!=None and "images" in frames:
            print(f"[DepthViewerAndQuilts] Processing {len(frames['images'])} images")
            
            for im in frames['images']:
                #print(f"[DepthViewerAndQuilts] Processing image: {im['name']}")
                if 'type' in im and (not f"[{im['type']}]" in im['name']):
                    im['name']=im['name']+" "+f"[{im['type']}]"
                
                try:
                    output_image, output_mask = load_image_to_tensor(im['name'])
                    ims.append(output_image)
                    print(f"[DepthViewerAndQuilts] Successfully loaded image: {im['name']}")
                except Exception as e:
                    print(f"[DepthViewerAndQuilts] Error loading image {im['name']}: {str(e)}")
                    print(f"[DepthViewerAndQuilts] Image data: {im}")
                    continue

            if len(ims)>0:
                print(f"[DepthViewerAndQuilts] Successfully processed {len(ims)} images")
                image1 = ims[0]
                for image2 in ims[1:]:
                    if image1.shape[1:] != image2.shape[1:]:
                        print(f"[DepthViewerAndQuilts] Resizing image from {image2.shape} to {image1.shape}")
                        try:
                            # 使用comfy.utils.common_upscale进行图片缩放
                            image2 = comfy.utils.common_upscale(
                                image2.movedim(-1, 1), 
                                image1.shape[2], 
                                image1.shape[1], 
                                "bilinear", 
                                "center"
                            ).movedim(1, -1)
                        except Exception as e:
                            print(f"[DepthViewerAndQuilts] Error resizing image: {str(e)}")
                            # 如果缩放失败，尝试使用PIL进行缩放
                            try:
                                pil_image = Image.fromarray((image2[0].cpu().numpy() * 255).astype(np.uint8))
                                pil_image = pil_image.resize((image1.shape[2], image1.shape[1]), Image.BILINEAR)
                                image2 = pil2tensor(pil_image)
                            except Exception as e2:
                                print(f"[DepthViewerAndQuilts] Error with PIL resize: {str(e2)}")
                                continue
                    image1 = torch.cat((image1, image2), dim=0)
            else:
                print("[DepthViewerAndQuilts] No images were successfully processed")

        return {"ui": {"reference_image": self.saved_reference, "depth_map": self.saved_depth}, "result": (image1,)}
    
NODE_CLASS_MAPPINGS = {
    "DepthViewerAndQuilts": DepthViewerAndQuilts,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DepthViewerAndQuilts": "DepthViewerAndQuilts",
}