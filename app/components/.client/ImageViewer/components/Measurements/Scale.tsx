import { useMeasurements } from "./useMeasurements";

const arr: [number, string][] = [
  [100, "10 cm"],
  [50, "5 cm"],
  [20, "2 cm"],
  [10, "1 cm"],
  [5, "5 mm"],
  [2, "2 mm"],
  [1, "1 mm"], // <==== reference
  [0.5, "500 µm"],
  [0.2, "200 µm"],
  [0.1, "100 µm"],
  [0.05, "50 µm"],
  [0.02, "20 µm"],
  [0.01, "10 µm"],
  [0.005, "5 µm"],
  [0.002, "2 µm"],
  [0.001, "1 µm"],
  [0.0005, "500 nm"],
  [0.0002, "200 nm"],
  [0.0001, "100 nm"],
  [0.00005, "50 nm"],
  [0.00002, "20 nm"],
  [0.00001, "10 nm"],
  [0.000005, "5 nm"],
  [0.000002, "2 nm"],
  [0.000001, "1 nm"],
];

const maxWidth = 140;
const getSize = (one_mm: number): [number, string] => {
  let n = 0;
  while (one_mm * arr[n][0] > maxWidth && n <= arr.length - 2) n++;
  return [one_mm * arr[n][0], arr[n][1]];
};

export const Scale = () => {
  const { one_mm } = useMeasurements();

  const [size, unit] = getSize(one_mm);

  return (
    <div
      className={`
        pointer-events-none 
        absolute top-0 right-0 
        flex flex-col items-center
        text-xs font-semibold
        bg-slate-300 text-slate-900

        `}
      style={{ width: size }}
    >
      {unit}
      {/* <rect
        x={screenWidth - size}
        width={size}
        height={16}
        className="fill-slate-300"
        fillOpacity={1}
      />
      <text
        x={screenWidth - size / 2}
        y={10}
        className="text-xs font-bold"
        textAnchor="middle"
        dominantBaseline="middle"
      >
        {unit}
      </text> */}
    </div>
  );
};
