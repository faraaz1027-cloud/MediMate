import { useEffect, useRef } from "react";

export default function ConfirmAction({ title, children, confirmLabel, onConfirm, onCancel, busy }) {
  const dialog = useRef(null);
  useEffect(() => {
    const node = dialog.current;
    node.showModal();
    return () => node.close();
  }, []);
  return (
    <dialog ref={dialog} className="confirmation-dialog" aria-labelledby="confirmation-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id="confirmation-title">{title}</h2>
      <div className="confirmation-content">{children}</div>
      <div className="confirmation-actions">
        <button disabled={busy} onClick={onConfirm}>{confirmLabel}</button>
        <button disabled={busy} onClick={onCancel}>Cancel</button>
      </div>
    </dialog>
  );
}
