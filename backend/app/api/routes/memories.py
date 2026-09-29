from fastapi import APIRouter, HTTPException

from app.memory import store

router = APIRouter(prefix="/api/memories", tags=["memories"])


@router.get("")
def list_memories() -> list[dict]:
    return store.list_memories()


@router.delete("/{memory_id}", status_code=204)
def delete_memory(memory_id: int) -> None:
    if not store.delete_memory(memory_id):
        raise HTTPException(status_code=404, detail="记忆不存在")
