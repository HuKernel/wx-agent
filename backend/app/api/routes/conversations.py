from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.conversations import store

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


class ConversationCreate(BaseModel):
    contact_name: str = Field(min_length=1, max_length=50)
    relationship: str = Field(default="朋友", max_length=20)


class MessageCreate(BaseModel):
    role: str = Field(pattern="^(them|me)$")
    text: str = Field(min_length=1, max_length=5000)


@router.get("")
def list_conversations() -> list[dict]:
    return store.list_conversations()


@router.post("", status_code=201)
def create_conversation(body: ConversationCreate) -> dict:
    return store.create_conversation(body.contact_name.strip(), body.relationship.strip() or "朋友")


@router.get("/{conversation_id}")
def get_conversation(conversation_id: str) -> dict:
    conv = store.get_conversation(conversation_id)
    if conv is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    return conv


@router.delete("/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: str) -> None:
    if not store.delete_conversation(conversation_id):
        raise HTTPException(status_code=404, detail="对话不存在")


@router.post("/{conversation_id}/messages", status_code=201)
def add_message(conversation_id: str, body: MessageCreate) -> dict:
    if store.get_conversation(conversation_id) is None:
        raise HTTPException(status_code=404, detail="对话不存在")
    return store.add_message(conversation_id, body.role, body.text.strip())


@router.delete("/{conversation_id}/messages/{message_id}", status_code=204)
def delete_message(conversation_id: str, message_id: int) -> None:
    if not store.delete_message(conversation_id, message_id):
        raise HTTPException(status_code=404, detail="消息不存在")
