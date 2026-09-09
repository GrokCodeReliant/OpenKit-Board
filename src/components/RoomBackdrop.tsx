/**
 * Original CSS hobby-room shell — warm, readable, non-branded.
 * Not a Demeo basement (no posters/CRT/era kitsch clones).
 */

export function RoomBackdrop() {
  return (
    <div className="room-backdrop" aria-hidden="true">
      <div className="room-wall" />
      <div className="room-ceiling" />
      <div className="room-floor" />
      <div className="room-window" />
      <div className="room-lamp" />
      <div className="room-shelf room-shelf-a" />
      <div className="room-shelf room-shelf-b" />
      <div className="room-shelf room-shelf-c" />
      <div className="room-crate room-crate-a" />
      <div className="room-crate room-crate-b" />
      <div className="room-plant" />
    </div>
  )
}
