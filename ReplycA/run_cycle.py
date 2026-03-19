import json
import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(PROJECT_ROOT)
if PROJECT_ROOT not in sys.path:
    sys.path.append(PROJECT_ROOT)


def run_gim():
    from milla_gim import generate_monologue

    success = generate_monologue()
    return {
        "success": bool(success),
        "cycle": "gim",
        "message": "GIM cycle completed" if success else "GIM cycle failed",
    }


def run_rem():
    from core_os.memory.digital_humanoid import DigitalHumanoid

    humanoid = DigitalHumanoid()
    result = humanoid.sleep_and_dream()
    return {
        "success": True,
        "cycle": "rem",
        "message": result,
    }


def main():
    cycle = (sys.argv[1] if len(sys.argv) > 1 else "").strip().lower()
    handlers = {
        "gim": run_gim,
        "rem": run_rem,
    }

    if cycle not in handlers:
        print(
            json.dumps(
                {
                    "success": False,
                    "message": "Usage: python run_cycle.py [gim|rem]",
                }
            )
        )
        sys.exit(1)

    try:
        payload = handlers[cycle]()
        print(json.dumps(payload))
        sys.exit(0 if payload.get("success") else 1)
    except Exception as error:
        print(
            json.dumps(
                {
                    "success": False,
                    "cycle": cycle,
                    "message": str(error),
                }
            )
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
