import { SNButton } from '../sn_button/sn_button';
import {
  SNDropdownMenu,
  SNDropdownMenuContent,
  SNDropdownMenuItem,
  SNDropdownMenuLabel,
  SNDropdownMenuSeparator,
  SNDropdownMenuTrigger,
} from './sn_dropdown_menu';

export function SNDropdownMenuGallery() {
  return (
    <section aria-labelledby="gallery-sn-dropdown-menu" className="space-y-4">
      <h2 id="gallery-sn-dropdown-menu" className="text-lg font-semibold text-text">
        SNDropdownMenu
      </h2>
      <SNDropdownMenu>
        <SNDropdownMenuTrigger asChild>
          <SNButton>Open menu</SNButton>
        </SNDropdownMenuTrigger>
        <SNDropdownMenuContent align="start" className="w-48">
          <SNDropdownMenuLabel>Chat</SNDropdownMenuLabel>
          <SNDropdownMenuItem>Rename</SNDropdownMenuItem>
          <SNDropdownMenuItem asChild>
            <a href="#sn-dropdown-link">As a link</a>
          </SNDropdownMenuItem>
          <SNDropdownMenuItem disabled>Disabled</SNDropdownMenuItem>
          <SNDropdownMenuSeparator />
          <SNDropdownMenuItem destructive>Delete</SNDropdownMenuItem>
        </SNDropdownMenuContent>
      </SNDropdownMenu>
    </section>
  );
}
