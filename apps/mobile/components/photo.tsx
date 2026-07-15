import { Image } from "expo-image";
import { cssInterop } from "nativewind";

cssInterop(Image, { className: "style" });

/** Meal photo: memory+disk cached so lists paint instantly on revisit,
 *  with a short fade on first load only. */
export function Photo(props: React.ComponentProps<typeof Image>) {
  return <Image cachePolicy="memory-disk" transition={150} {...props} />;
}
