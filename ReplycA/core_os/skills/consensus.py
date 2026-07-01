import collections
from core_os.memory.agent_memory import memory
from core_os.skills.auto_lib import model_manager

def reach_consensus(prompt: str, n_agents: int = 3) -> str:
    print(f"[*] Initiating Consensus Protocol with {n_agents} agents...")
    responses = []
    for i in range(n_agents):
        try:
            res = model_manager.chat(messages=[{"role": "user", "content": prompt}])
            responses.append(res['message']['content'])
        except Exception as e:
            print(f"[!] Agent {i} failed: {e}")
            
    if not responses:
        return "[Consensus Error]: No agents responded."
        
    if all(len(r.split()) < 10 for r in responses):
        counts = collections.Counter(responses)
        best, _ = counts.most_common(1)[0]
        return best
    else:
        synth_prompt = f"Synthesize the following {len(responses)} perspectives into one coherent consensus:\n"
        for i, r in enumerate(responses):
            synth_prompt += f"\nPerspective {i+1}:\n{r}\n"
            
        try:
            synth_res = model_manager.chat(messages=[
                {"role": "system", "content": "You are the Consensus Synthesizer."},
                {"role": "user", "content": synth_prompt}
            ])
            return synth_res['message']['content']
        except Exception as e:
            return f"[Consensus Synthesis Error]: {e}"