import { css, mixin } from "~/frontend/kit/css.ts";

export const PulseMixin = mixin`
    animation: pulse 1.4s ease-in-out infinite;
`;

export const StatusTextMixin = mixin`
    [role="status"] {
        font-size: 0.9em;
        font-weight: var(--weight-regular);
        color: var(--subtle);
    }

    [role="status"][aria-busy="true"] {
        ${PulseMixin};
    }
`;

document.adoptedStyleSheets.push(css`
    @keyframes pulse {
        0%,
        100% {
            opacity: 0.45;
        }
        50% {
            opacity: 1;
        }
    }
`.sheet());
