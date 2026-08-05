import json
import os
import glob

tools_dir = r"c:\Users\Usuario\Desktop\Proyectos\Personales\Minecraft\AddOns\Enderite Mod\Enderite Mod BP\items\tools"
vanilla_tools_dir = r"c:\Users\Usuario\Desktop\Proyectos\Personales\Minecraft\AddOns\Enderite Mod\Enderite Mod BP\items\vanilla tools"

def update_file(path, is_netherite):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    components = data.get("minecraft:item", {}).get("components", {})
    
    # Get the identifier of the tool
    identifier = data.get("minecraft:item", {}).get("description", {}).get("identifier", "")
    if not identifier:
        return
        
    ingot = "minecraft:netherite_ingot" if is_netherite else "ed:enderite_ingot"
    
    components["minecraft:repairable"] = {
        "repair_items": [
            {
                "items": [ingot],
                "repair_amount": "query.max_durability*0.25"
            },
            {
                "items": [identifier],
                "repair_amount": "context.other->query.remaining_durability+0.12*context.other->query.max_durability"
            }
        ]
    }
    
    with open(path, 'w', encoding='utf-8') as f:
        # Dump with formatting, but we might lose some exact indentation style, 
        # usually json.dump(indent=4) is fine, but bedrock uses tabs sometimes.
        # Let's use tabs.
        json.dump(data, f, indent='\t')
        
for file in glob.glob(os.path.join(vanilla_tools_dir, "netherite_*.json")):
    print("Updating", file)
    update_file(file, True)
    
for file in glob.glob(os.path.join(tools_dir, "enderite_*.json")):
    print("Updating", file)
    update_file(file, False)

print("Done")
