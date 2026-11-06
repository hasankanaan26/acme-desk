"""
Run a checkpoint without conflicting with the base-app/ folder.

Usage:
    python run_checkpoint.py checkpoint-1-foundations
    python run_checkpoint.py checkpoint-4-analysis

The script adds the checkpoint directory to sys.path so Python
finds the checkpoint's app/ package.
"""

import sys
import os

import uvicorn


def main():
    if len(sys.argv) < 2:
        print("Usage: python run_checkpoint.py <checkpoint-folder-name>\n")
        print("Available checkpoints:")
        checkpoints_dir = "checkpoints"
        if os.path.isdir(checkpoints_dir):
            for d in sorted(os.listdir(checkpoints_dir)):
                if os.path.isdir(os.path.join(checkpoints_dir, d)):
                    print(f"  {d}")
        sys.exit(1)

    checkpoint = sys.argv[1]
    checkpoint_path = os.path.join("checkpoints", checkpoint)

    if not os.path.isdir(checkpoint_path):
        print(f"Error: {checkpoint_path} not found")
        sys.exit(1)

    print(f"[runner] Starting {checkpoint} on http://localhost:8000")
    print(f"[runner] Swagger UI: http://localhost:8000/docs")
    print(f"[runner] Press Ctrl+C to stop\n")

    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
        reload_dirs=[checkpoint_path],
        app_dir=checkpoint_path,
    )


if __name__ == "__main__":
    main()
