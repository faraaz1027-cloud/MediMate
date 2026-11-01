import { useEffect, useId, useRef, useState } from "react";

// Shared summary and field associations; native required/type/pattern checks stay active.
export default function ValidatedForm({ onSubmit, children, ...props }) {
  const form = useRef(null), id = useId();
  const [errors, setErrors] = useState([]);
  useEffect(() => {
    const marked = [];
    errors.forEach((error, i) => {
      const control = form.current.elements.namedItem(error.path.split(".").at(-1));
      if (!control?.setAttribute) return;
      const previous = control.getAttribute("aria-describedby");
      control.setAttribute("aria-invalid", "true");
      control.setAttribute("aria-describedby", [previous, `${id}-${i}`].filter(Boolean).join(" "));
      marked.push({ control, previous });
    });
    if (marked.length) marked[0].control.focus();
    return () => marked.forEach(({ control, previous }) => {
      control.removeAttribute("aria-invalid");
      if (previous) control.setAttribute("aria-describedby", previous);
      else control.removeAttribute("aria-describedby");
    });
  }, [errors, id]);
  return <form {...props} ref={form} onInputCapture={() => { if (errors.length) setErrors([]); }} onSubmit={async (event) => {
    event.preventDefault();
    const blank = [...event.currentTarget.elements].filter((e) => e.required && e.type !== "password" && typeof e.value === "string" && !e.value.trim());
    if (blank.length) { setErrors(blank.map((e) => ({ path: e.name, message: "Enter a value other than spaces." }))); return; }
    setErrors([]);
    const result = await onSubmit(event);
    if (result?.error?.fields?.length) setErrors(result.error.fields);
  }}>
    {!!errors.length && <div role="alert" className="alert"><p>Check these fields:</p><ul>{errors.map((e, i) => <li id={`${id}-${i}`} key={e.path + i}>{e.message}</li>)}</ul></div>}
    {children}
  </form>;
}
