// services/notion/notionReader.js
const { Client } = require("@notionhq/client");
const dotenv = require("dotenv");

dotenv.config();

const notion = new Client({ auth: process.env.NOTION_API_KEY });

function isFullBlock(block) {
  return block && typeof block === "object" && "type" in block;
}

async function getFormattedNotionContent(blockId, depth = 0) {
  let content = "";
  const response = await notion.blocks.children.list({
    block_id: blockId,
    page_size: 100,
  });

  for (const block of response.results) {
    if (!isFullBlock(block)) continue;

    const indent = "  ".repeat(depth);

    if (block.type === "paragraph") {
      const text = block.paragraph.rich_text.map((t) => t.plain_text).join("");
      content += `${indent}${text}\n`;
    }

    if (block.type === "heading_1") {
      const text = block.heading_1.rich_text.map((t) => t.plain_text).join("");
      content += `${indent}# ${text}\n`;
    }

    if (block.type === "heading_2") {
      const text = block.heading_2.rich_text.map((t) => t.plain_text).join("");
      content += `${indent}## ${text}\n`;
    }

    if (block.type === "heading_3") {
      const text = block.heading_3.rich_text.map((t) => t.plain_text).join("");
      content += `${indent}### ${text}\n`;
    }

    if (block.has_children && block.type !== "child_database") {
      content += await getFormattedNotionContent(block.id, depth + 1);
    }
  }

  return content;
}

module.exports = {
  getFormattedNotionContent,
};
