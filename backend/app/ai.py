import json
from typing import Annotated, Literal

from pydantic import BaseModel, Field, TypeAdapter


class CreateCardOperation(BaseModel):
    type: Literal["create_card"]
    column_id: int
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=10_000)


class EditCardOperation(BaseModel):
    type: Literal["edit_card"]
    card_id: int
    title: str = Field(min_length=1, max_length=200)
    details: str = Field(default="", max_length=10_000)


class DeleteCardOperation(BaseModel):
    type: Literal["delete_card"]
    card_id: int


class MoveCardOperation(BaseModel):
    type: Literal["move_card"]
    card_id: int
    column_id: int
    position: int = Field(ge=0)


class RenameColumnOperation(BaseModel):
    type: Literal["rename_column"]
    column_id: int
    title: str = Field(min_length=1, max_length=200)


BoardOperation = Annotated[
    CreateCardOperation
    | EditCardOperation
    | DeleteCardOperation
    | MoveCardOperation
    | RenameColumnOperation,
    Field(discriminator="type"),
]


class ModelResult(BaseModel):
    reply: str = Field(min_length=1, max_length=10_000)
    operations: list[BoardOperation] = Field(default_factory=list, max_length=20)


MODEL_RESULT_ADAPTER = TypeAdapter(ModelResult)


def parse_model_result(content: str) -> ModelResult:
    try:
        return MODEL_RESULT_ADAPTER.validate_json(content)
    except ValueError as error:
        raise ValueError("The AI provider returned an invalid structured response.") from error


def build_provider_prompt(board: dict, messages: list[dict], user_message: str) -> str:
    result_schema = ModelResult.model_json_schema()
    return (
        "You are a project-management assistant. Reply with JSON only that conforms "
        "to this schema: "
        f"{json.dumps(result_schema, separators=(',', ':'))}\n"
        "Use numeric database IDs from the board. Do not include an operation unless it "
        "is requested or clearly necessary.\n"
        f"Current board: {json.dumps(board, separators=(',', ':'))}\n"
        f"Recent conversation: {json.dumps(messages, separators=(',', ':'))}\n"
        f"User message: {user_message}"
    )