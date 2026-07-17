# Database Design

## Ownership

SQLite is the only persistence store for this MVP. `users` owns `boards`, and
each user has exactly one board enforced by the unique `boards.user_id` key.
`columns` belong to a board; `cards` belong to a column; and
`conversation_messages` belong directly to a user. All ownership links use
foreign keys with cascading deletion.

The fixed `user` account is seeded with one board titled `Kanban Studio`, five
columns in the existing demo order, and the eight existing demo cards. The
seed runs only when the fixed user does not already exist, so restarting the
application never overwrites changes.

## Ordering

`columns.position`, `cards.position`, and `conversation_messages.position` are
zero-based, contiguous positions within their owner. Their unique composite
indexes prevent duplicate positions. Reads order each collection by `position`.

Creating a card appends it at the end of its column. Deleting a card closes the
gap in the remaining cards. Moving or reordering a card occurs in a single
transaction: remove it from the source position, compact the source list when
necessary, make room in the destination list, then assign its new column and
position. A failure rolls back every step.

Columns are fixed in count and order for this MVP. Their `title` values may be
renamed, but they are neither created, deleted, nor reordered.

## Messages

Conversation messages have only a role and content in the MVP. A user message
and the assistant response receive successive positions, and stored messages
are returned in ascending position order. The later AI integration may select a
bounded most-recent portion of this ordered history for a provider request.

## Implementation Boundary

[`database-schema.json`](database-schema.json) is the approval record for the
relational schema. Phase 6 implements it with SQLite DDL, connection and
initialization code, seed logic, authenticated board and conversation APIs, and
transactional board mutations. The Compose-managed `project-management-data`
volume mounts at `/data`, where the application stores its SQLite database.
