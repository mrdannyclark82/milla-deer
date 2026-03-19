import { InferenceClient } from "@huggingface/inference";

const client = new InferenceClient(process.env.HF_TOKEN);

const image = await client.textToImage({
    provider: "fal-ai",
    model: "Tongyi-MAI/Z-Image-Turbo",
	inputs: "Astronaut riding a horse",
	parameters: { num_inference_steps: 5 },
});
/// Use the generated image (it's a Blob)
