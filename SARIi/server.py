from flask import Flask, request, jsonify
from flask_cors import CORS
import threading

app = Flask(__name__)
CORS(app)

# Global reference to the main command processor (to be set by main.py)
command_processor = None

def set_command_processor(processor_func):
    global command_processor
    command_processor = processor_func

@app.route('/api/status', methods=['GET'])
def get_status():
    # Placeholder for actual hardware status logic
    # In a full implementation, this would query the battery/wifi state
    return jsonify({
        'status': 'online',
        'battery': 'unknown', # To be connected to Termux API
        'wifi': 'unknown'
    })

@app.route('/api/command', methods=['POST'])
def post_command():
    data = request.get_json()
    if not data or 'command' not in data:
        return jsonify({'error': 'No command provided'}), 400
    
    command = data['command']
    print(f"Server received command: {command}")
    
    response_text = "Command received but processor not linked."
    
    if command_processor:
        try:
            # Execute the command using the linked processor
            # Note: In a real app, this might need to be async or queued
            response_text = command_processor(command)
        except Exception as e:
            response_text = f"Error processing command: {e}"
            
    return jsonify({
        'message': f"Command processed: {command}",
        'response': response_text
    })

def run_server(port=5000):
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)

if __name__ == '__main__':
    run_server()
