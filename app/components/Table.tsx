import { ReactNode } from "react";

interface TableProps {
  columns: string[];
  data: (string | ReactNode)[][];
}

const TH = ({ children }: { children?: ReactNode }) => (
  <th className="text-left">{children}</th>
);

const TD = ({ children }: { children?: ReactNode }) => (
  <td className="text-left ">{children}</td>
);

const TR = ({
  children,
  index = 0,
}: {
  children?: ReactNode;
  index?: number;
}) => (
  <tr
    className={`
      h-8
      ${index % 2 === 0 ? "bg-none" : "bg-gray-50"}  
    `}
  >
    {children}
  </tr>
);

export function Table({ columns, data }: TableProps) {
  return (
    <table className="w-full border-collapse ">
      <thead className="bg-gray-100">
        <TR>
          {["", ...columns].map((columnName) => (
            <TH key={columnName}>{columnName}</TH>
          ))}
        </TR>
      </thead>
      <tbody>
        {data.map((row, index) => (
          <TR index={index} key={index}>
            <TH>{index + 1}</TH>
            {row.map((d, i) => (
              <TD key={i}>{d}</TD>
            ))}
          </TR>
        ))}
      </tbody>
    </table>
  );
}
