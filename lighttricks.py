from gradio_client import Client, handle_file

client = Client("Lightricks/LTX-2-3")
result = client.predict(
	input_image=handle_file('https://raw.githubusercontent.com/gradio-app/gradio/main/test/test_files/bus.png'),
	prompt="Make this image come alive with cinematic motion, smooth animation",
	duration=3.0,
	enhance_prompt=False,
	seed=10,
	randomize_seed=True,
	height=1024,
	width=1536,
	api_name="/generate_video",
)
print(result)
