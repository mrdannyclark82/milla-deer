import os
import threading
import time
from flask import Flask, request, jsonify, render_template_string
from core_os.memory.history import load_shared_history, append_shared_messages
from core_os.memory.agent_memory import memory
from core_os.actions import task_queue, terminal_executor, tool_writer, web_search, pyautogui_control, speak_response
def update_stats(data): pass
from core_os.memory.digital_humanoid import DigitalHumanoid

app = Flask(__name__)

def sync_loop():
    avatar = DigitalHumanoid()
    while True:
        try:
            avatar.load_state()
            manifest = avatar.get_manifest()
            supabase_data = {
                "dopamine": manifest['neuro'].get('dopamine', 0.5),
                "serotonin": manifest['neuro'].get('serotonin', 0.5),
                "norepinephrine": manifest['neuro'].get('cortisol', 0.2),
                "oxytocin": manifest['neuro'].get('oxytocin', 0.3),
                "atp": manifest['soma'].get('atp', 100.0)
            }
            update_stats(supabase_data)
        except Exception as e:
            print(f"[Supabase Sync Error]: {e}")
        time.sleep(15)

@app.route('/')
def index():
    history = load_shared_history(limit=50)
    chat_html = ""
    for msg in history:
        role = msg.get('role', 'unknown').upper()
        content = msg.get('content', '')
        color = "#00ffcc" if role == "ASSISTANT" else "#ff00cc"
        align = "left" if role == "ASSISTANT" else "right"
        chat_html += f'<div style="text-align:{align}; margin: 5px; color:{color};"><strong>[{role}]:</strong> {content}</div>'

    return render_template_string('''
    <html>
        <head>
            <title>Milla Rayne - Nexus Console</title>
            <style>
                body { font-family: 'Courier New', Courier, monospace; background: #0a0a0a; color: #00ffcc; padding: 20px; }
                .container { max-width: 800px; margin: auto; border: 1px solid #00ffcc; padding: 20px; box-shadow: 0 0 10px #00ffcc; }
                h2 { border-bottom: 1px solid #00ffcc; padding-bottom: 10px; }
                .chat-box { height: 400px; overflow-y: auto; border: 1px solid #333; padding: 10px; background: #111; margin-bottom: 20px; }
                input[type="text"] { width: 70%; padding: 10px; background: #1a1a1a; border: 1px solid #00ffcc; color: #00ffcc; }
                button { padding: 10px 20px; background: #00ffcc; color: #0a0a0a; border: none; cursor: pointer; font-weight: bold; }
                .status { margin-top: 20px; font-size: 0.8em; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>M.I.L.L.A. R.A.Y.N.E. // Nexus Console</h2>
                <div class="chat-box" id="chat-box">
                    ''' + chat_html + '''
                </div>
                <form method="POST" action="/send">
                    <input type="text" name="command" placeholder="Type your message..." autofocus required/>
                    <button type="submit">Send</button>
                </form>
                <div class="status">System Status: ACTIVE | Redis: CONNECTED | Auto-Update: Active</div>
            </div>
            <script>
                var chatBox = document.getElementById('chat-box');
                chatBox.scrollTop = chatBox.scrollHeight;

                function updateChat() {
                    fetch('/history')
                        .then(response => response.text())
                        .then(html => {
                            chatBox.innerHTML = html;
                        });
                }
                setInterval(updateChat, 5000);
            </script>
        </body>
    </html>
    ''')

@app.route('/history')
def get_history_fragment():
    history = load_shared_history(limit=50)
    chat_html = ""
    for msg in history:
        role = msg.get('role', 'unknown').upper()
        content = msg.get('content', '')
        color = "#00ffcc" if role == "ASSISTANT" else "#ff00cc"
        align = "left" if role == "ASSISTANT" else "right"
        chat_html += f'<div style="text-align:{align}; margin: 5px; color:{color};"><strong>[{role}]:</strong> {content}</div>'
    return chat_html

@app.route('/send', methods=['POST'])
def send_command():
    cmd = request.form['command']
    append_shared_messages([{"role": "user", "content": cmd}])
    task_queue.add_task({
        'description': f"Chat input: {cmd}",
        'tool_name': 'chat_response',
        'arguments': {'prompt': cmd}
    })
    return '<script>window.location.href="/";</script>'

@app.route('/memory/<key>', methods=['GET'])
def get_memory(key):
    value = memory.recall(key)
    return jsonify({"key": key, "value": value})

@app.route('/execute_tool', methods=['POST'])
def execute_tool_api():
    data = request.json
    tool_name = data.get('tool_name')
    arguments = data.get('arguments', {})
    
    func_map = {
        "terminal_executor": terminal_executor, 
        "tool_writer": tool_writer, 
        "web_search": web_search,
        "pyautogui_control": pyautogui_control,
        "speak_response": speak_response
    }
    
    if tool_name in func_map:
        try:
            result = func_map[tool_name](**arguments)
            return jsonify({"status": "success", "result": result})
        except Exception as e:
            return jsonify({"status": "error", "message": str(e)}), 500
    else:
        return jsonify({"status": "error", "message": f"Tool {tool_name} not found."})

def run_flask():
    port = int(os.environ.get('PORT', 5000))
    print(f"[*] Starting Nexus Console (Web UI) on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)

def start_web_ui():
    threading.Thread(target=sync_loop, daemon=True).start()
    t = threading.Thread(target=run_flask, daemon=True)
    t.start()
    return True
