import { OrthographicView } from "@deck.gl/core";
import { useMemo } from "react";

import { ViewPort } from "../../state/types";

export const useView = ({ width, height }: ViewPort) => {
  /** Setup Orthographic View */
  const view = useMemo(() => {
    return new OrthographicView({
      id: "detail",
      height: height,
      width: width,
      x: 0,
      y: 0,
    });
  }, [width, height]);

  return view;
};
