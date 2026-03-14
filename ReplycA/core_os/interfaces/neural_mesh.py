import time
import random
from rich.console import Console
from rich.live import Live
from rich.panel import Panel
from rich.layout import Layout
from rich.text import Text
from rich.align import Align

class NeuralMesh:
    def __init__(self):
        self.console = Console()
        self.nodes = ["·", "•", "○", "◍", "◎", "◌", "⊕", "⊗"]
        self.width = 60
        self.height = 20
        
        # Vertex Mapping for Milla's Face Outline
        self.face_map = [
            "           .-------.           ",
            "        .-'         '-.        ",
            "       /   (O)   (O)   \       ",
            "      |                 |      ",
            "      |   \         /   |      ",
            "      |    '-------'    |      ",
            "       \               /       ",
            "        '-.________.-'         ",
            "            |||||||            ",
            "          '---------'          "
        ]
        self.face_start_y = 4
        self.face_start_x = (self.width - len(self.face_map[0])) // 2

    def generate_mesh(self, progress=0.0):
        """
        Generates a mesh that slowly resolves into a face outline.
        - progress 0.0 to 0.5: Random noise increases in density.
        - progress 0.5 to 1.0: Nodes lock into the face vertices.
        """
        mesh_lines = []
        density = 0.1 + (progress * 0.4)
        
        for y in range(self.height):
            line = list(" " * self.width)
            for x in range(self.width):
                # 1. Check if coordinate is part of the Face Map
                is_face_pixel = False
                face_char = " "
                
                rel_y = y - self.face_start_y
                rel_x = x - self.face_start_x
                
                if 0 <= rel_y < len(self.face_map) and 0 <= rel_x < len(self.face_map[0]):
                    face_char = self.face_map[rel_y][rel_x]
                    if face_char != " ":
                        is_face_pixel = True

                # 2. Logic: Noise vs Vertex Mapping
                if is_face_pixel:
                    # Face pixels solidify as progress increases
                    if random.random() < (progress * 1.5):
                        line[x] = face_char if progress > 0.8 else random.choice(self.nodes)
                    elif random.random() < density:
                        line[x] = random.choice(self.nodes)
                else:
                    # Background pixels stay noisy but fade out near the end
                    bg_density = density * (1.0 - (progress * 0.8))
                    if random.random() < bg_density:
                        line[x] = random.choice(self.nodes)
            
            mesh_lines.append("".join(line))
            
        return "\n".join(mesh_lines)

    def animate(self, duration=5, message="INITIALIZING NEURAL MESH"):
        with Live(console=self.console, refresh_per_second=12) as live:
            start_time = time.time()
            while True:
                elapsed = time.time() - start_time
                progress = elapsed / duration
                if progress > 1.0: progress = 1.0
                
                mesh_art = self.generate_mesh(progress)
                
                # Dynamic Coloring based on progress
                # Cyan (Cold/Start) -> Magenta (Warm/Active) -> Green (Success/Resolved)
                if progress < 0.4: color = "cyan"
                elif progress < 0.8: color = "magenta"
                else: color = "bright_green"
                
                display = Panel(
                    Align.center(
                        f"[bold {color}]{mesh_art}[/]\n"
                        f"[dim]{message}... [{int(progress * 100)}%][/]"
                    ),
                    border_style=color,
                    title="[bold]MEA OS BOOT SEQUENCE[/]",
                    subtitle="[dim]Codename: Neon Cat[/]"
                )
                live.update(display)
                
                if progress >= 1.0:
                    time.sleep(0.5) # Hold final frame
                    break
                time.sleep(0.08)

if __name__ == "__main__":
    mesh = NeuralMesh()
    mesh.animate()
