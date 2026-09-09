import { SEAT_PADS } from '../seatPads'

/**
 * Decorative seat mats / silhouettes around the table rim.
 * Pure presence chrome — no networking, no avatars, no protocol.
 */
export function SeatPads() {
  return (
    <div className="seat-pads" aria-hidden="true">
      {SEAT_PADS.map((seat) => (
        <div
          key={seat.id}
          className={`seat-pad seat-${seat.side}${seat.you ? ' seat-you' : ' seat-empty'}`}
        >
          <div className="seat-mat">
            <div className="seat-silhouette" />
            {seat.you && <span className="seat-you-tag">You</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
