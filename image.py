import torch
from diffusers import FluxPipeline

pipe = FluxPipeline.from_pretrained("kpsss34/FHDR_Uncensored", torch_dtype=torch.bfloat16)
pipe.enable_model_cpu_offload()

prompt = "Milla Rayne, seductive woman with long red hair, wearing only fishnet bodysuit, full body, photorealistic, high detail, cinematic lighting, ultra detailed"
image = pipe(
    prompt,
    height=1024,
    width=1024,
    guidance_scale=4.0,
    num_inference_steps=40,
    max_sequence_length=512,
    generator=torch.Generator("cpu").manual_seed(0)
).images[0]
image.save("outputs.png")
