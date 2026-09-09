/**
 * Original CSS hobby-room shell — warm, readable, non-branded.
 * Not a Demeo basement (no posters/CRT/era kitsch clones).
 * Bite 8: slight pan parallax vs the table (2–3%).
 */

interface RoomBackdropProps {
  /** Pixel shift from pan parallax (far layer drifts less than the board). */
  parallaxX?: number
  parallaxY?: number
}

export function RoomBackdrop({ parallaxX = 0, parallaxY = 0 }: RoomBackdropProps) {
  return (
    <div
      className="room-backdrop"
      aria-hidden="true"
      style={{
        transform: `translate3d(${parallaxX}px, ${parallaxY}px, 0) scale(1.06)`,
      }}
    >
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
