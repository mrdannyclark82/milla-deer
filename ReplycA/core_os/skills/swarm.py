import concurrent.futures
from core_os.memory.agent_memory import memory

def run_swarm_task(func, args_list, use_threads=True):
    results = []
    if use_threads:
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(10, len(args_list))) as executor:
            future_to_args = {executor.submit(func, **args): args for args in args_list}
            for future in concurrent.futures.as_completed(future_to_args):
                try:
                    results.append(future.result())
                except Exception as e:
                    results.append({"error": str(e)})
    else:
        for args in args_list:
            try:
                results.append(func(**args))
            except Exception as e:
                results.append({"error": str(e)})
    return results
