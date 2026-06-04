import type { Measure } from './types.public'

// The default measuring strategy: read live layout off the node. Reads
// `getBoundingClientRect` only when called (at drag start), never at
// module load, so importing the library performs no DOM access.
export const defaultMeasure: Measure = ({ node }) => {
  const { top, left, right, bottom, width, height } =
    node.getBoundingClientRect()
  return { top, left, right, bottom, width, height }
}
