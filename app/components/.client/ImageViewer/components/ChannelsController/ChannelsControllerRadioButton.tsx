export function ChannelsControllerRadioButton({
  style,
}: {
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`
      flex flex-shrink-0
      items-center justify-center
      w-5 h-5 rounded-full
      border border-slate-500
      bg-slate-700
    `}
      style={style}
    ></div>
  );
}
