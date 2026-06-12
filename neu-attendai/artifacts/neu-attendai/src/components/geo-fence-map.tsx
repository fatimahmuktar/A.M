import { motion } from "framer-motion";

interface StudentDot {
  id: number;
  angle: number;
  distance: number;
  status: "present" | "flagged";
}

const STUDENT_DOTS: StudentDot[] = [
  { id: 1, angle:  30, distance:  40, status: "present" },
  { id: 2, angle: 120, distance:  60, status: "present" },
  { id: 3, angle: 210, distance:  20, status: "present" },
  { id: 4, angle: 330, distance:  80, status: "present" },
  { id: 5, angle:  45, distance: 150, status: "flagged" }, // outside geo-fence
  { id: 6, angle: 280, distance: 130, status: "flagged" }, // outside geo-fence
];

const GEO_RADIUS = 100; // SVG units (represents 50 m)

export function GeoFenceMap() {
  return (
    <div className="relative w-full aspect-square max-w-[300px] mx-auto bg-card rounded-xl border border-border overflow-hidden flex items-center justify-center p-4">
      <svg viewBox="-150 -150 300 300" className="w-full h-full" aria-label="Geo-fence student map">

        {/* Cross-hair grid lines */}
        <g stroke="currentColor" strokeWidth="1" className="text-border/30">
          <line x1="-150" y1="0" x2="150" y2="0" />
          <line x1="0" y1="-150" x2="0" y2="150" />
        </g>

        {/* Pulse ring outside the geo-fence boundary */}
        <motion.circle
          cx="0" cy="0" r={GEO_RADIUS}
          fill="currentColor"
          className="text-primary/10"
          initial={{ scale: 0.8, opacity: 0.5 }}
          animate={{ scale: 1.1, opacity: 0 }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeOut" }}
        />

        {/* Geo-fence boundary circle */}
        <circle
          cx="0" cy="0" r={GEO_RADIUS}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary/20"
        />

        {/* Classroom centre point */}
        <circle cx="0" cy="0" r="5" className="fill-primary" />

        {/* Student position dots */}
        {STUDENT_DOTS.map((dot) => {
          const rad = (dot.angle * Math.PI) / 180;
          const x = dot.distance * Math.cos(rad);
          const y = dot.distance * Math.sin(rad);
          return (
            <motion.circle
              key={dot.id}
              cx={x} cy={y} r="6"
              className={dot.status === "flagged" ? "fill-destructive" : "fill-primary"}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: dot.id * 0.08 }}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 right-4 flex justify-between text-xs font-mono">
        <span className="flex items-center gap-1.5 text-primary">
          <span className="w-2 h-2 bg-primary rounded-full" />
          In Range
        </span>
        <span className="flex items-center gap-1.5 text-destructive">
          <span className="w-2 h-2 bg-destructive rounded-full" />
          Out of Range
        </span>
      </div>
    </div>
  );
}
