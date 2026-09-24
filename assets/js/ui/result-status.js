// Presentation only: success requires every final connection to be adopted by the plan.
export function summarizeResult(frameCount, connections, plan) {
  const failed = { status: 'failed', message: '自動結合できない画像があります',
    guidance: '画像を追加し直すか、前後に同じ因子が入るように撮影し直して、再度お試しください。' };
  if (!frameCount || !plan || plan.segments.length !== frameCount
      || connections.length !== frameCount - 1
      || connections.some((pair) => !pair || !['confirmed', 'review'].includes(pair.status))) return failed;
  const uncertain = connections.filter((pair, index) => pair.status !== 'confirmed'
    || plan.segments[index + 1].adopted !== true).length;
  if (uncertain) return { status: 'review', message: `結合位置を確認できない箇所が${uncertain}件あります`,
    guidance: '前後の画像に同じ因子がもう少し入るように撮影し、再度お試しください。プレビューでは未確認の箇所に重複が残ります。' };
  return { status: 'success', message: frameCount === 1 ? '1枚の画像を表示しました' : `${frameCount}枚の画像を結合しました`,
    guidance: '結合プレビューで画像の順番とつなぎ目を確認してください。' };
}
