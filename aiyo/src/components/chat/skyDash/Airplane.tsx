import { memo, type FC } from "react";
import { AIRPLANE_SIZE } from "./useGameEngine";

interface AirplaneProps {
  y: number;
}

const Airplane: FC<AirplaneProps> = ({ y }) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 50,
        top: 0,
        width: AIRPLANE_SIZE,
        height: AIRPLANE_SIZE,
        transform: `translateY(${y}px)`,
        willChange: "transform",
        zIndex: 10,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        style={{ filter: "drop-shadow(2px 2px 2px rgba(0,0,0,0.3))" }}
      >
        <path
          d="M10,50 L80,50 L90,40 L95,45 L90,55 L80,60 L10,60 Z"
          fill="#ecf0f1"
          stroke="#2c3e50"
          strokeWidth="2"
        />
        <path d="M60,50 L75,50 L75,42 Z" fill="#3498db" stroke="#2c3e50" strokeWidth="1" />
        <path d="M10,50 L10,30 L25,50 Z" fill="#e74c3c" stroke="#2c3e50" strokeWidth="2" />
        <path d="M40,55 L30,75 L50,75 L60,55 Z" fill="#bdc3c7" stroke="#2c3e50" strokeWidth="2" />
      </svg>
    </div>
  );
};

export default memo(Airplane);
