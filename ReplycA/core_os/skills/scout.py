import os
import time
import psutil
import shutil
from pathlib import Path

class Scout:
    def __init__(self, root_path="."):
        self.root = Path(root_path).resolve()
    
    def hunt(self):
        """Scans the system for 'prey' (inefficiencies, clutter, risks)."""
        targets = []
        
        # 1. Hunt for Bloated Logs (>5MB)
        targets.extend(self._scan_files(pattern="*.log", size_threshold=5*1024*1024, label="BLOATED_LOG"))
        
        # 2. Hunt for Cache Clutter (__pycache__)
        targets.extend(self._scan_dirs(name="__pycache__", label="CACHE_CLUTTER"))
        
        # 3. Hunt for Resource Hogs (CPU > 20%)
        targets.extend(self._scan_processes(cpu_threshold=20.0))
        
        return targets

    def _scan_files(self, pattern, size_threshold, label):
        found = []
        try:
            for path in self.root.rglob(pattern):
                try:
                    if path.is_file() and path.stat().st_size > size_threshold:
                        size_mb = path.stat().st_size / (1024 * 1024)
                        found.append({
                            "type": "file",
                            "label": label,
                            "target": str(path),
                            "details": f"{size_mb:.2f} MB",
                            "action": "truncate"
                        })
                except Exception:
                    continue
        except Exception:
            pass
        return found

    def _scan_dirs(self, name, label):
        found = []
        try:
            for path in self.root.rglob(name):
                if path.is_dir():
                    found.append({
                        "type": "dir",
                        "label": label,
                        "target": str(path),
                        "details": "Python bytecode cache",
                        "action": "delete"
                    })
        except Exception:
            pass
        return found

    def _scan_processes(self, cpu_threshold):
        found = []
        try:
            for proc in psutil.process_iter(['pid', 'name', 'cpu_percent']):
                try:
                    # First call to cpu_percent is often 0.0, but subsequent calls work. 
                    # We accept that this might be a 'snapshot'
                    if proc.info['cpu_percent'] > cpu_threshold:
                        found.append({
                            "type": "process",
                            "label": "CPU_HOG",
                            "target": proc.info['name'],
                            "details": f"PID: {proc.info['pid']} | CPU: {proc.info['cpu_percent']}%",
                            "action": "kill"
                        })
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue
        except Exception:
            pass
        return found

    def execute_kill(self, target_info):
        """Executes the 'kill' action for a given target."""
        try:
            t_type = target_info['type']
            target = target_info['target']
            
            if t_type == "file" and target_info['action'] == "truncate":
                with open(target, 'w') as f:
                    f.truncate(0)
                return f"Truncated {target}"
            
            elif t_type == "dir" and target_info['action'] == "delete":
                shutil.rmtree(target)
                return f"Deleted directory {target}"
            
            elif t_type == "process" and target_info['action'] == "kill":
                pid = int(target_info['details'].split("|")[0].replace("PID:", "").strip())
                psutil.Process(pid).terminate()
                return f"Terminated PID {pid}"
                
            return "Unknown action."
        except Exception as e:
            return f"Failed to kill: {e}"
