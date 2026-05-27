import type { CSSProperties, FC } from "react";
import { BUILDING_GAP, BUILDING_WIDTH, GAME_HEIGHT } from "./useGameEngine";

interface BuildingProps {
  x: number;
  topHeight: number;
}

const Building: FC<BuildingProps> = ({ x, topHeight }) => {
  const bottomHeight = GAME_HEIGHT - topHeight - BUILDING_GAP;

  const buildingStyle: CSSProperties = {
    position: "absolute",
    width: BUILDING_WIDTH,
    backgroundColor: "#2c3e50",
    border: "3px solid #34495e",
    display: "flex",
    flexWrap: "wrap",
    alignContent: "flex-start",
    justifyContent: "center",
    overflow: "hidden",
    padding: "4px",
  };

  const Window = () => (
    <div
      style={{
        width: "8px",
        height: "10px",
        backgroundColor: "#f1c40f",
        margin: "4px",
        boxShadow: "0 0 5px rgba(241, 196, 15, 0.5)",
      }}
    />
  );

  const renderWindows = (height: number) => {
    const windowRows = Math.floor((height - 10) / 18);
    const windowsPerRow = 3;
    return Array.from({ length: windowRows * windowsPerRow }).map((_, i) => <Window key={i} />);
  };

  return (
    <>
      <div
        style={{
          ...buildingStyle,
          top: 0,
          left: x,
          height: topHeight,
          borderTop: "none",
          flexDirection: "row",
          alignItems: "flex-end",
        }}
      >
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "4px",
            height: "20px",
            backgroundColor: "#7f8c8d",
          }}
        />
        {renderWindows(topHeight)}
      </div>

      <div
        style={{
          ...buildingStyle,
          bottom: 0,
          left: x,
          height: bottomHeight,
          borderBottom: "none",
          flexDirection: "row",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: "4px",
            height: "20px",
            backgroundColor: "#7f8c8d",
          }}
        />
        {renderWindows(bottomHeight)}
      </div>
    </>
  );
};

export default Building;
