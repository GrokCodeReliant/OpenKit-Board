interface NewBoardButtonProps {
  disabled?: boolean
  onClick: () => void
}

export function NewBoardButton({ disabled, onClick }: NewBoardButtonProps) {
  return (
    <div className="new-board-control" role="group" aria-label="Session">
      <button
        type="button"
        className="new-board-btn"
        title="Clear the solo board and arrive at the table again"
        disabled={disabled}
        onClick={onClick}
      >
        New board
      </button>
    </div>
  )
}
