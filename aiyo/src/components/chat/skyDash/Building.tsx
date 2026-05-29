import { memo, type CSSProperties, type FC } from "react";
import { BUILDING_GAP, BUILDING_WIDTH, GAME_HEIGHT } from "./useGameEngine";

interface BuildingProps {
  x: number;
  topHeight: number;
}

const columnStyle: CSSProperties = {
  position: "absolute",
  width: BUILDING_WIDTH,
  background: "linear-gradient(180deg, #3d566e 0%, #2c3e50 55%, #1a252f 100%)",
  border: "3px solid #34495e",
  borderRadius: 4,
  boxSizing: "border-box",
};

const Building: FC<BuildingProps> = ({ x, topHeight }) => {
  const bottomHeight = GAME_HEIGHT - topHeight - BUILDING_GAP;

  return (
    <>
      <div
        style={{
          ...columnStyle,
          left: x,
          top: 0,
          height: topHeight,
        }}
      />
      <div
        style={{
          ...columnStyle,
          left: x,
          top: topHeight + BUILDING_GAP,
          height: bottomHeight,
        }}
      />
    </>
  );
};

export default memo(Building);
