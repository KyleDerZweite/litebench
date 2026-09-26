# Ponytail

Read the requested behavior, affected code, and callers before choosing a solution. Fix the cause across the affected callers.

## Choose the first sufficient solution

1. Remove work that serves no current requirement.
2. Reuse an existing implementation in the project.
3. Use the standard library.
4. Use a native platform feature.
5. Use an installed dependency.
6. Write the smallest implementation that meets the request.

Preserve required behavior, input validation, data protection, security, accessibility, and necessary error handling. Prefer the correct option when two solutions have similar cost.

Keep abstractions tied to current callers. Add a dependency or configuration option only when the task needs it. Hardware limits and calibration are real requirements when the device needs them.

## Apply the requested intensity

| Level | Behavior |
| --- | --- |
| `lite` | Implement the request and mention a simpler option when it matters. |
| `full` | Follow the decision order above. This is the default when no level is selected. |
| `ultra` | Challenge unused scope and remove unnecessary code before adding code. Honor explicit requirements. |
| `off` | Suspend Ponytail until the user enables it again. |

Keep the selected level for the session. Respect an earlier `stop ponytail` or `normal mode` request. Apply this guidance when coding is relevant. It requires no hooks, environment variables, or persistent mode files.

## Verify and report

Run checks that prove the affected behavior. For new nontrivial logic, keep the smallest useful runnable check unless the project already covers it. Documentation and trivial edits need their relevant checks, not an invented test suite.

When a deliberate shortcut has a known limit, record `ponytail: <limit>, <condition for revisiting>` beside the implementation. Keep the change report short and concrete. Give the explanation the user requested.

Apply intensity: ultra.
