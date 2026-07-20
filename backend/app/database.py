import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.ai import BoardOperation

DEFAULT_DATABASE_PATH = Path("/data/project-management.db")

DEMO_COLUMNS = [
    ("Backlog", [("Align roadmap themes", "Draft quarterly themes with impact statements and metrics."), ("Gather customer signals", "Review support tags, sales notes, and churn feedback.")]),
    ("Discovery", [("Prototype analytics view", "Sketch initial dashboard layout and key drill-downs.")]),
    ("In Progress", [("Refine status language", "Standardize column labels and tone across the board."), ("Design card layout", "Add hierarchy and spacing for scanning dense lists.")]),
    ("Review", [("QA micro-interactions", "Verify hover, focus, and loading states.")]),
    ("Done", [("Ship marketing page", "Final copy approved and asset pack delivered."), ("Close onboarding sprint", "Document release notes and share internally.")]),
]


@contextmanager
def connection(database_path: Path) -> Iterator[sqlite3.Connection]:
    database_path.parent.mkdir(parents=True, exist_ok=True)
    database = sqlite3.connect(database_path)
    database.row_factory = sqlite3.Row
    database.execute("PRAGMA foreign_keys = ON")
    try:
        yield database
        database.commit()
    except Exception:
        database.rollback()
        raise
    finally:
        database.close()


def initialize(database_path: Path) -> None:
    with connection(database_path) as database:
        database.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY,
                username TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS boards (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
                title TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS columns (
                id INTEGER PRIMARY KEY,
                board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                position INTEGER NOT NULL CHECK (position >= 0),
                UNIQUE (board_id, position)
            );
            CREATE TABLE IF NOT EXISTS cards (
                id INTEGER PRIMARY KEY,
                column_id INTEGER NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                details TEXT NOT NULL,
                position INTEGER NOT NULL CHECK (position >= 0),
                UNIQUE (column_id, position)
            );
            CREATE TABLE IF NOT EXISTS conversation_messages (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
                content TEXT NOT NULL,
                position INTEGER NOT NULL CHECK (position >= 0),
                UNIQUE (user_id, position)
            );
            """
        )
        user = database.execute("SELECT id FROM users WHERE username = 'user'").fetchone()
        if user is not None:
            return

        user_id = database.execute("INSERT INTO users (username) VALUES ('user')").lastrowid
        board_id = database.execute(
            "INSERT INTO boards (user_id, title) VALUES (?, 'Kanban Studio')", (user_id,)
        ).lastrowid
        for column_position, (column_title, cards) in enumerate(DEMO_COLUMNS):
            column_id = database.execute(
                "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
                (board_id, column_title, column_position),
            ).lastrowid
            database.executemany(
                "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
                [(column_id, title, details, card_position) for card_position, (title, details) in enumerate(cards)],
            )


def _user_id(database: sqlite3.Connection, username: str) -> int:
    user = database.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone()
    if user is None:
        raise LookupError("User not found")
    return int(user["id"])


def _owned_column(database: sqlite3.Connection, user_id: int, column_id: int) -> None:
    column = database.execute(
        """SELECT columns.id FROM columns JOIN boards ON boards.id = columns.board_id
        WHERE columns.id = ? AND boards.user_id = ?""",
        (column_id, user_id),
    ).fetchone()
    if column is None:
        raise LookupError("Column not found")


def _owned_card(database: sqlite3.Connection, user_id: int, card_id: int) -> sqlite3.Row:
    card = database.execute(
        """SELECT cards.column_id, cards.position FROM cards JOIN columns ON columns.id = cards.column_id
        JOIN boards ON boards.id = columns.board_id WHERE cards.id = ? AND boards.user_id = ?""",
        (card_id, user_id),
    ).fetchone()
    if card is None:
        raise LookupError("Card not found")
    return card


def board_for_user(database_path: Path, username: str) -> dict:
    with connection(database_path) as database:
        user_id = _user_id(database, username)
        board = database.execute("SELECT id, title FROM boards WHERE user_id = ?", (user_id,)).fetchone()
        if board is None:
            raise LookupError("Board not found")
        columns = database.execute(
            "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board["id"],)
        ).fetchall()
        cards = database.execute(
            """
            SELECT cards.id, cards.column_id, cards.title, cards.details
            FROM cards JOIN columns ON columns.id = cards.column_id
            WHERE columns.board_id = ? ORDER BY cards.column_id, cards.position
            """,
            (board["id"],),
        ).fetchall()
        cards_by_column: dict[int, list[str]] = {int(column["id"]): [] for column in columns}
        serialized_cards = {}
        for card in cards:
            card_id = str(card["id"])
            cards_by_column[int(card["column_id"])].append(card_id)
            serialized_cards[card_id] = {"id": card_id, "title": card["title"], "details": card["details"]}
        return {
            "id": str(board["id"]),
            "title": board["title"],
            "columns": [
                {"id": str(column["id"]), "title": column["title"], "cardIds": cards_by_column[int(column["id"])]}
                for column in columns
            ],
            "cards": serialized_cards,
        }


# --- Board mutations ---------------------------------------------------------
# Each helper runs inside an open transaction and raises LookupError (not found)
# or ValueError (invalid request). They are shared by the REST endpoints and the
# AI operation applier so ownership checks and ordering rules stay in one place.


def _rename_column(database: sqlite3.Connection, user_id: int, column_id: int, title: str) -> None:
    if database.execute(
        """UPDATE columns SET title = ? WHERE id = ? AND board_id =
        (SELECT id FROM boards WHERE user_id = ?)""",
        (title, column_id, user_id),
    ).rowcount != 1:
        raise LookupError("Column not found")


def _create_card(database: sqlite3.Connection, user_id: int, column_id: int, title: str, details: str) -> None:
    _owned_column(database, user_id, column_id)
    position = database.execute(
        "SELECT COUNT(*) AS count FROM cards WHERE column_id = ?", (column_id,)
    ).fetchone()["count"]
    database.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
        (column_id, title, details, position),
    )


def _update_card(database: sqlite3.Connection, user_id: int, card_id: int, title: str, details: str) -> None:
    if database.execute(
        """UPDATE cards SET title = ?, details = ? WHERE id = ? AND column_id IN
        (SELECT columns.id FROM columns JOIN boards ON boards.id = columns.board_id WHERE boards.user_id = ?)""",
        (title, details, card_id, user_id),
    ).rowcount != 1:
        raise LookupError("Card not found")


def _delete_card(database: sqlite3.Connection, user_id: int, card_id: int) -> None:
    card = _owned_card(database, user_id, card_id)
    database.execute("DELETE FROM cards WHERE id = ?", (card_id,))
    database.execute(
        "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
        (card["column_id"], card["position"]),
    )


def _move_card(
    database: sqlite3.Connection, user_id: int, card_id: int, target_column_id: int, target_position: int
) -> None:
    card = _owned_card(database, user_id, card_id)
    _owned_column(database, user_id, target_column_id)
    destination_count = database.execute(
        "SELECT COUNT(*) AS count FROM cards WHERE column_id = ?", (target_column_id,)
    ).fetchone()["count"]
    max_position = destination_count - (1 if card["column_id"] == target_column_id else 0)
    if target_position > max_position:
        raise ValueError("Target position is outside the column")
    # UNIQUE(column_id, position) is checked per statement, so shift through an
    # offset band to avoid transient collisions: park the moved card far away,
    # close the gap it left, open a gap at the target, then seat the card.
    database.execute("UPDATE cards SET position = 2_000_000 WHERE id = ?", (card_id,))
    database.execute(
        "UPDATE cards SET position = position - 1 WHERE column_id = ? AND position > ?",
        (card["column_id"], card["position"]),
    )
    database.execute(
        """UPDATE cards SET position = position + 1_000_000
        WHERE column_id = ? AND position >= ? AND id != ?""",
        (target_column_id, target_position, card_id),
    )
    database.execute(
        """UPDATE cards SET position = position - 999_999
        WHERE column_id = ? AND position >= 1_000_000 AND id != ?""",
        (target_column_id, card_id),
    )
    database.execute(
        "UPDATE cards SET column_id = ?, position = ? WHERE id = ?",
        (target_column_id, target_position, card_id),
    )


def _mutate(database_path: Path, username: str, apply) -> dict:
    with connection(database_path) as database:
        apply(database, _user_id(database, username))
    return board_for_user(database_path, username)


def rename_column(database_path: Path, username: str, column_id: int, title: str) -> dict:
    return _mutate(database_path, username, lambda db, uid: _rename_column(db, uid, column_id, title))


def create_card(database_path: Path, username: str, column_id: int, title: str, details: str) -> dict:
    return _mutate(database_path, username, lambda db, uid: _create_card(db, uid, column_id, title, details))


def update_card(database_path: Path, username: str, card_id: int, title: str, details: str) -> dict:
    return _mutate(database_path, username, lambda db, uid: _update_card(db, uid, card_id, title, details))


def delete_card(database_path: Path, username: str, card_id: int) -> dict:
    return _mutate(database_path, username, lambda db, uid: _delete_card(db, uid, card_id))


def move_card(database_path: Path, username: str, card_id: int, target_column_id: int, target_position: int) -> dict:
    return _mutate(
        database_path, username, lambda db, uid: _move_card(db, uid, card_id, target_column_id, target_position)
    )


def messages_for_user(database_path: Path, username: str) -> list[dict]:
    with connection(database_path) as database:
        user_id = _user_id(database, username)
        messages = database.execute(
            "SELECT id, role, content FROM conversation_messages WHERE user_id = ? ORDER BY position",
            (user_id,),
        ).fetchall()
    return [{"id": str(message["id"]), "role": message["role"], "content": message["content"]} for message in messages]


def _append_messages(database: sqlite3.Connection, user_id: int, entries: list[tuple[str, str]]) -> None:
    position = database.execute(
        "SELECT COUNT(*) AS count FROM conversation_messages WHERE user_id = ?", (user_id,)
    ).fetchone()["count"]
    database.executemany(
        "INSERT INTO conversation_messages (user_id, role, content, position) VALUES (?, ?, ?, ?)",
        [(user_id, role, content, position + offset) for offset, (role, content) in enumerate(entries)],
    )


def create_message(database_path: Path, username: str, role: str, content: str) -> list[dict]:
    with connection(database_path) as database:
        _append_messages(database, _user_id(database, username), [(role, content)])
    return messages_for_user(database_path, username)


_APPLY_OPERATION = {
    "rename_column": lambda db, uid, op: _rename_column(db, uid, op.column_id, op.title),
    "create_card": lambda db, uid, op: _create_card(db, uid, op.column_id, op.title, op.details),
    "edit_card": lambda db, uid, op: _update_card(db, uid, op.card_id, op.title, op.details),
    "delete_card": lambda db, uid, op: _delete_card(db, uid, op.card_id),
    "move_card": lambda db, uid, op: _move_card(db, uid, op.card_id, op.column_id, op.position),
}


def apply_ai_result(
    database_path: Path,
    username: str,
    user_message: str,
    assistant_reply: str,
    operations: list[BoardOperation],
) -> tuple[list[dict], dict]:
    with connection(database_path) as database:
        user_id = _user_id(database, username)
        for operation in operations:
            _APPLY_OPERATION[operation.type](database, user_id, operation)
        _append_messages(
            database, user_id, [("user", user_message), ("assistant", assistant_reply)]
        )
    return messages_for_user(database_path, username), board_for_user(database_path, username)
