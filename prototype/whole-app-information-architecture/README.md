# Whole-app information architecture prototype

Throwaway prototype for **Prototype the whole-app information architecture**.
It compares three organizing principles on one route:

- `A`: activity-centered resume cockpit
- `B`: question-led canvas
- `C`: object-visible library workbench

Run from the repository root:

```sh
python -m http.server 8000
```

Then open:

```text
http://localhost:8000/prototype/whole-app-information-architecture/
```

Use the bottom arrows or the `variant=A|B|C` search parameter. Use **Try a
whole-app journey** to compare how each variant handles return, intake, reading,
research, Draft review, learning, and operational exceptions. All state is
simulated in memory.
