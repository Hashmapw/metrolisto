# 城市数据协议 v1

全地铁的地图和路由使用同一份、与供应商无关的 `CityData`。TypeScript 定义位于 `src/types.ts`，运行时校验器为 `src/lib/validate.ts` 中的 `validateCity`。

## 添加城市

1. 复制 `docs/city.example.json` 到 `src/data/your-city.json`，按下表填写真实数据。
2. 在 `src/data/index.ts` 导入 JSON，并添加到注册列表：

```ts
import yourCity from './your-city.json';
export const cities: CityData[] = [shanghai, beijing, yourCity].map(validateCity);
```

3. 运行 `pnpm test` 和 `pnpm build`。选择新增城市，检查线路、换乘、终点、支线和环线几何。

无需修改地图、算法、存储键或页面逻辑。内置上海/北京线路数量的断言只适用于这两城，全网连通性测试会自动覆盖新城市。

## 顶层字段

| 字段            | 类型               | 说明                                                |
| --------------- | ------------------ | --------------------------------------------------- |
| `schemaVersion` | `1`                | 协议版本                                            |
| `id`            | string             | 稳定标识，使用小写字母、数字、短横线，如 `shanghai` |
| `name` / `en`   | string             | 中文显示名、英文显示名                              |
| `updatedAt`     | string             | 数据日期，如 `2026-10-03`                           |
| `description`   | string             | 运营范围说明                                        |
| `center`        | `[number, number]` | 默认地图视图中心（示意坐标）                        |
| `sources`       | `{title, url}[]`   | 数据来源，URL 使用 HTTP(S)                          |
| `stations`      | Station[]          | 去重后的站点                                        |
| `lines`         | MetroLine[]        | 线路                                                |
| `segments`      | Segment[]          | 所有相邻站点区间                                    |

## 站点

```ts
interface Station {
  id: string;
  name: string;
  en?: string;
  aliases?: string[];
  x: number;
  y: number;
  label?: number;
}
```

`x/y` 是用于扁平变形地图的平面坐标，**不是经纬度**。推荐约 3000×2400 的画布，站距约 50–100 单位，尽量使用水平、竖直和 45° 线段。

实际可换乘的多条线路共用同一个站点 ID。仅同名、不直接换乘的独立车站使用不同 ID；可以在名字后注明线路。`aliases` 可以添加曾用名或拼音（搜索忽略空格和大小写）。`label` 可选，用奇偶性指定优先尝试的站名排布方向，最终会自动避让其他文字。

## 线路

```ts
interface MetroLine {
  id: string;
  name: string;
  shortName: string;
  color: string; // #RRGGBB
  kind: 'metro' | 'rail' | 'tram' | 'maglev';
  stationIds: string[];
}
```

`stationIds` 只描述线路包含哪些站点，用于筛选和统计。**不会根据数组顺序隐式连线**。请用下面的 `segments` 明确给出所有区间，因此环线、支线和单向线路不需要特殊插件。

同一线路的支线使用同一个 `lineId`，不会被当作跨线换乘；当前协议不另外模拟同线路内的列车交路或同线换车。

## 区间

```ts
interface Segment {
  id: string;
  lineId: string;
  from: string;
  to: string;
  points?: [number, number][];
  oneWay?: boolean;
}
```

- 默认双向，`oneWay: true` 表示仅可由 `from` 到 `to`。
- `points` 为区间的 SVG 折线坐标（含两端），没有时直接连接站点坐标。
- 环线应显式提供末站到首站的区间。
- 支线分别提供分岔站到各分支的区间，不添加分支终点间的虚构连接。
- 同一线路共用的主干区间只写一次。不同线路共轨时保留各自区间，足迹会分别统计。
- ID 应保持稳定，站名更改或几何调整不要随意更换站点/线路/区间 ID，否则旧足迹与备份无法对应。

## 路径与状态

路径算法为 Dijkstra，状态包含当前站、到达区间、已完成的有序换乘约束。综合推荐的每个区间成本为 1、每次换车额外成本为 4；换乘最少模式使用大于网络区间总数的换车成本。可选换乘站必须发生实际换车，单纯经过不能满足约束。

每条旅程保存有序的 `stationIds`、`segmentIds`、`lineIds`、`transferIds`。起终点为上下车，实际换车站为换乘，其余为途经。多次记录取并集，换乘和上下车状态分别保留。

内置校验会拒绝重复 ID、无效坐标、缺失引用、不合法颜色、与线路归属不符的区间等。测试还检查所有站点双向可达。如果新增城市确有互不连接的独立运营网络，可扩展连通性测试按连通分量断言；跨网络路径会正常返回“未找到通路”。

可选 `sameLineTransfers` 为区间 ID 对数组：每对必须是同一线路上相邻的两个区间，表示在它们之间换车也计为换乘。例如上海 10 号线龙溪路的两个支线方向；主干至任一支线仍算直达。线路收藏仍按 `lineId` 合并，路线搜索会保留到达区间状态来判断换车。

备份可包含 `quarantined` 数组，每项保存 `cityId`、原始 `value` 与校验失败 `reason`。读取及导入时隔离无效记录、未知城市或无效城市记录列表；其余有效记录可继续使用和保存。隔离数据随导出保留、重复导入去重，不计入足迹。无法解析 JSON 或整体版本错误仍阻止覆盖原始存储。

区间可设置 `curve: "cubic"` 使用三次 Bézier 曲线：`points` 首项为起点，之后每三项依次为两个控制点和终点；不设置时仍绘制折线。曲线只影响示意图形状，不改变区间端点或行车方向。
